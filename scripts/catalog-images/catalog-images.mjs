import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInventory, readInventory } from "./inventory.mjs";
import { renderReviewReport } from "./report.mjs";
import { rollbackUpload, uploadApproved } from "./storage.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(SCRIPT_DIR, "../..");
const STYLE_ROOT = path.join(PROJECT_DIR, "outputs", "catalog-images", "catalog-style-v1");
const DEFAULT_INVENTORY = path.join(STYLE_ROOT, "inventory", "inventory.json");
const DEFAULT_CONFIG = path.join(SCRIPT_DIR, "catalog-style-v1.json");
const VENV_PYTHON = path.join(
  PROJECT_DIR,
  ".codex-tmp",
  "catalog-images-venv",
  "Scripts",
  "python.exe",
);
const MODEL_HOME = path.join(PROJECT_DIR, ".codex-tmp", "catalog-images-models");
const DEFAULT_PILOT_SKUS = [
  "CAR-005",
  "CAB-024",
  "FRE-002",
  "AUR-007",
  "ILU-004",
  "ILU-005",
  "ADA-003",
  "TEC-003",
  "FRE-001",
  "PAR-001",
  "PAR-002",
  "TEC-007",
  "VAR-010",
  "AUR-003",
];

function usage() {
  return `
Normalización profesional de fotos del catálogo Chetech.

Preparación y auditoría (no modifica Supabase):
  node scripts/catalog-images/catalog-images.mjs --dry-run
  node scripts/catalog-images/catalog-images.mjs --pilot [10-20]
  node scripts/catalog-images/catalog-images.mjs --sku ADA-003 [--sku CAB-024]
  node scripts/catalog-images/catalog-images.mjs --pending --pilot-approval <approval.json>
  node scripts/catalog-images/catalog-images.mjs --report-only --manifest <manifest.json>

Lote completo (bloqueado hasta aprobar el piloto):
  node scripts/catalog-images/catalog-images.mjs --all --pilot-approval <approval.json>

Publicación reversible (nunca se ejecuta sin aprobación firmada):
  node scripts/catalog-images/catalog-images.mjs --upload --manifest <manifest.json> --approval <approval.json> [--dry-run]
  node scripts/catalog-images/catalog-images.mjs --rollback <upload-rollback.json> [--dry-run]

Opciones:
  --inventory <archivo>      Inventario JSON (por defecto: ${DEFAULT_INVENTORY})
  --config <archivo>         Plantilla visual versionada.
  --overrides <archivo>      Fuente, recorte o máscara manual por SKU/imagen.
  --output <carpeta>         Carpeta del run.
  --refresh-inventory        Vuelve a consultar y respaldar antes del run.
  --production-source        Usa exactamente la imagen publicada como fuente.
  --no-report                No crea la página de comparación.
`;
}

function takeValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Falta el valor de ${option}.`);
  return value;
}

export function parseArgs(argv) {
  const options = { skus: [], report: true, refreshInventory: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--pilot") {
      options.mode = "pilot";
      const possibleCount = argv[index + 1];
      if (possibleCount && !possibleCount.startsWith("--")) {
        options.pilotCount = Number.parseInt(possibleCount, 10);
        index += 1;
      }
    } else if (argument === "--sku") {
      options.mode = "sku";
      options.skus.push(takeValue(argv, index, argument).toUpperCase());
      index += 1;
    } else if (argument === "--pending") options.mode = "pending";
    else if (argument === "--all") options.mode = "all";
    else if (argument === "--report-only") options.mode = "report";
    else if (argument === "--upload") options.mode = "upload";
    else if (argument === "--rollback") {
      options.mode = "rollback";
      options.rollback = takeValue(argv, index, argument);
      index += 1;
    } else if (argument === "--inventory") {
      options.inventory = takeValue(argv, index, argument);
      index += 1;
    } else if (argument === "--config") {
      options.config = takeValue(argv, index, argument);
      index += 1;
    } else if (argument === "--output") {
      options.output = takeValue(argv, index, argument);
      index += 1;
    } else if (argument === "--manifest") {
      options.manifest = takeValue(argv, index, argument);
      index += 1;
    } else if (argument === "--overrides") {
      options.overrides = takeValue(argv, index, argument);
      index += 1;
    } else if (argument === "--approval") {
      options.approval = takeValue(argv, index, argument);
      index += 1;
    } else if (argument === "--pilot-approval") {
      options.pilotApproval = takeValue(argv, index, argument);
      index += 1;
    } else if (argument === "--refresh-inventory") options.refreshInventory = true;
    else if (argument === "--production-source") options.productionSource = true;
    else if (argument === "--no-report") options.report = false;
    else throw new Error(`Opción desconocida: ${argument}`);
  }
  if (options.help) return options;
  if (!options.mode) options.mode = options.dryRun ? "inventory" : null;
  if (!options.mode) throw new Error("Falta un modo. Usá --help para ver los comandos.");
  if (options.mode === "pilot") {
    options.pilotCount ??= DEFAULT_PILOT_SKUS.length;
    if (
      !Number.isInteger(options.pilotCount) ||
      options.pilotCount < 10 ||
      options.pilotCount > 20
    ) {
      throw new Error("--pilot debe incluir entre 10 y 20 productos.");
    }
  }
  if (options.mode === "sku" && options.skus.length === 0) {
    throw new Error("--sku requiere al menos un SKU.");
  }
  return options;
}

function run(command, args, { env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: PROJECT_DIR,
      stdio: "inherit",
      shell: false,
      env: env ?? process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} finalizó con código ${code}.`));
    });
  });
}

async function writeJson(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function sha256(filename) {
  return createHash("sha256")
    .update(await fs.readFile(filename))
    .digest("hex");
}

function runToken(prefix) {
  const date = new Date();
  const stamp = date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `${prefix}-${stamp}`;
}

async function ensureInventory(options) {
  const inventoryPath = path.resolve(options.inventory ?? DEFAULT_INVENTORY);
  if (options.refreshInventory) {
    return {
      inventory: await buildInventory({
        outputRoot: path.dirname(inventoryPath),
        downloadProduction: true,
      }),
      inventoryPath,
    };
  }
  try {
    return { inventory: await readInventory(inventoryPath), inventoryPath };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return {
      inventory: await buildInventory({
        outputRoot: path.dirname(inventoryPath),
        downloadProduction: true,
      }),
      inventoryPath,
    };
  }
}

function primaryForSku(inventory, sku) {
  const images = inventory.items.filter((item) => item.sku === sku);
  return images.find((item) => item.is_primary) ?? images[0] ?? null;
}

function selectPilot(inventory, count) {
  const selected = [];
  for (const sku of DEFAULT_PILOT_SKUS) {
    const item = primaryForSku(inventory, sku);
    if (item) selected.push(item);
    if (selected.length === count) return selected;
  }
  for (const item of inventory.items) {
    if (
      !item.is_primary ||
      selected.some((candidate) => candidate.product_id === item.product_id)
    ) {
      continue;
    }
    selected.push(item);
    if (selected.length === count) break;
  }
  if (selected.length < count) {
    throw new Error(`El inventario solo permitió seleccionar ${selected.length} productos.`);
  }
  return selected;
}

export function toJobItem(item, override = null, { productionSource = false } = {}) {
  const source = productionSource ? item.production : (item.source ?? item.production);
  const sourcePath = override?.source_path ?? source?.local_path;
  if (!sourcePath) {
    throw new Error(
      `No existe una fuente local para ${item.sku} (${item.production.storage_path}).`,
    );
  }
  return {
    image_id: item.image_id,
    product_id: item.product_id,
    sku: item.sku,
    product_name: item.product_name,
    is_primary: item.is_primary,
    position: item.position,
    source_path: path.resolve(sourcePath),
    source_override: Boolean(override?.source_path),
    source_provenance: override?.source_path
      ? "manual-source-override"
      : productionSource
        ? "current-production-upload"
        : (item.source?.provenance ?? "production-backup-fallback"),
    pre_crop: override?.pre_crop ?? null,
    mask_override_path: override?.mask_path ? path.resolve(override.mask_path) : null,
    production_url: item.production.url,
    production_storage_path: item.production.storage_path,
  };
}

async function verifyPilotApproval(filename) {
  const resolved = path.resolve(filename);
  const approval = JSON.parse(await fs.readFile(resolved, "utf8"));
  if (approval.scope !== "pilot" || (approval.decision ?? approval.pilot_decision) !== "approved") {
    throw new Error("El lote completo requiere un piloto aprobado explícitamente.");
  }
  if (
    !Array.isArray(approval.items) ||
    approval.items.some((item) => !["approved", "rejected"].includes(item.decision))
  ) {
    throw new Error("La revisión del piloto todavía contiene decisiones pendientes.");
  }
  const manifestPath = path.resolve(approval.manifest_path);
  if ((await sha256(manifestPath)) !== approval.manifest_sha256) {
    throw new Error("El manifiesto del piloto cambió después de la aprobación.");
  }
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (
    manifest.mode !== "pilot" ||
    manifest.run_id !== approval.run_id ||
    manifest.pipeline_version !== approval.pipeline_version
  ) {
    throw new Error("La aprobación no corresponde al manifiesto del piloto indicado.");
  }
  if (
    manifest.summary?.errors !== 0 ||
    manifest.summary?.processed !== manifest.summary?.requested
  ) {
    throw new Error("No se puede aprobar un piloto incompleto o con errores.");
  }
  const decisions = new Map(approval.items.map((item) => [item.image_id, item.decision]));
  if (
    decisions.size !== manifest.items.length ||
    manifest.items.some((item) => !["approved", "rejected"].includes(decisions.get(item.id)))
  ) {
    throw new Error("La aprobación debe contener exactamente todos los ítems del piloto.");
  }
  return {
    ...approval,
    approved_config_sha256: manifest.config_sha256,
    approved_model_files: manifest.environment?.model_files ?? [],
  };
}

async function ensurePython() {
  try {
    await fs.access(VENV_PYTHON);
  } catch {
    throw new Error(
      `No existe el entorno Python. Crealo con:\npy -3.13 -m venv .codex-tmp\\catalog-images-venv\n.\\.codex-tmp\\catalog-images-venv\\Scripts\\python.exe -m pip install -r scripts\\catalog-images\\requirements.lock`,
    );
  }
}

async function processSelection({ mode, items, options, inventoryPath, gate = null }) {
  await ensurePython();
  const runId = runToken(mode);
  const outputDir = path.resolve(
    options.output ?? path.join(STYLE_ROOT, mode === "all" ? "full" : mode, runId),
  );
  const jobPath = path.join(outputDir, "job.json");
  const configPath = path.resolve(options.config ?? DEFAULT_CONFIG);
  const configHash = await sha256(configPath);
  if (gate?.approved_config_sha256 && gate.approved_config_sha256 !== configHash) {
    throw new Error(
      "La configuración del lote completo no coincide con la plantilla aprobada en el piloto.",
    );
  }
  for (const approvedModel of gate?.approved_model_files ?? []) {
    const currentModelPath = path.join(MODEL_HOME, path.basename(approvedModel.path));
    try {
      if ((await sha256(currentModelPath)) !== approvedModel.sha256) {
        throw new Error("hash diferente");
      }
    } catch {
      throw new Error(
        `El modelo ${path.basename(approvedModel.path)} no coincide con el aprobado en el piloto.`,
      );
    }
  }
  let overrideEntries = [];
  if (options.overrides) {
    const overrideDocument = JSON.parse(await fs.readFile(path.resolve(options.overrides), "utf8"));
    overrideEntries = Array.isArray(overrideDocument)
      ? overrideDocument
      : (overrideDocument.items ?? []);
    if (!Array.isArray(overrideEntries)) {
      throw new Error("El archivo de overrides debe ser un array o contener items[].");
    }
  }
  const itemKey = (item) => `${item.product_id}:${item.production.storage_path}`;
  const overridesByItem = new Map();
  for (const entry of overrideEntries) {
    if (!entry?.sku) throw new Error("Cada override debe declarar sku.");
    const matches = items.filter(
      (item) =>
        entry.sku === item.sku &&
        (!entry.image_id || entry.image_id === item.image_id) &&
        (!entry.production_storage_path ||
          entry.production_storage_path === item.production.storage_path),
    );
    if (matches.length !== 1) {
      throw new Error(
        `El override de ${entry.sku} debe coincidir con exactamente una imagen; coincidió con ${matches.length}.`,
      );
    }
    const key = itemKey(matches[0]);
    if (overridesByItem.has(key)) {
      throw new Error(
        `Hay más de un override para ${entry.sku} (${matches[0].production.storage_path}).`,
      );
    }
    overridesByItem.set(key, entry);
  }
  const overrideFor = (item) => overridesByItem.get(itemKey(item)) ?? null;
  await writeJson(jobPath, {
    schema_version: 1,
    run_id: runId,
    mode,
    pipeline_version: "catalog-style-v1",
    generated_at: new Date().toISOString(),
    inventory_path: inventoryPath,
    inventory_sha256: await sha256(inventoryPath),
    config_sha256: configHash,
    approval_gate: gate
      ? {
          run_id: gate.run_id,
          manifest_sha256: gate.manifest_sha256,
          pilot_decision: gate.decision ?? gate.pilot_decision,
          approved_config_sha256: gate.approved_config_sha256,
          approved_model_files: gate.approved_model_files,
        }
      : null,
    overrides_path: options.overrides ? path.resolve(options.overrides) : null,
    items: items.map((item) =>
      toJobItem(item, overrideFor(item), { productionSource: options.productionSource }),
    ),
  });
  await run(
    VENV_PYTHON,
    [
      path.join(SCRIPT_DIR, "python", "process_batch.py"),
      "--job",
      jobPath,
      "--config",
      configPath,
      "--output",
      outputDir,
    ],
    {
      env: {
        ...process.env,
        U2NET_HOME: MODEL_HOME,
        PYTHONUTF8: "1",
      },
    },
  );
  const manifestPath = path.join(outputDir, "manifest.json");
  const result = {
    mode,
    run_id: runId,
    output: outputDir,
    manifest: manifestPath,
    published: false,
    database_modified: false,
    storage_modified: false,
  };
  if (options.report) result.review = await renderReviewReport({ manifestPath });
  if (mode === "pilot") {
    await writeJson(path.join(STYLE_ROOT, "latest-pilot.json"), result);
  }
  return result;
}

export function isCurrentCatalogStyleImage(item, pipelineVersion = "catalog-style-v1") {
  const storagePath = String(item?.production?.storage_path ?? "")
    .replace(/\\/gu, "/")
    .toLowerCase();
  return storagePath.includes(`/normalized/${pipelineVersion.toLowerCase()}/`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.mode === "inventory") {
    const inventory = await buildInventory({
      outputRoot: path.dirname(path.resolve(options.inventory ?? DEFAULT_INVENTORY)),
      downloadProduction: true,
    });
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          published: false,
          database_modified: false,
          storage_modified: false,
          inventory: path.resolve(options.inventory ?? DEFAULT_INVENTORY),
          summary: inventory.summary,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (options.mode === "report") {
    let manifestPath = options.manifest;
    if (!manifestPath) {
      const latest = JSON.parse(
        await fs.readFile(path.join(STYLE_ROOT, "latest-pilot.json"), "utf8"),
      );
      manifestPath = latest.manifest;
    }
    console.log(JSON.stringify(await renderReviewReport({ manifestPath }), null, 2));
    return;
  }
  if (options.mode === "upload") {
    if (!options.manifest || !options.approval) {
      throw new Error("--upload requiere --manifest y --approval.");
    }
    console.log(
      JSON.stringify(
        await uploadApproved({
          manifestPath: options.manifest,
          approvalPath: options.approval,
          dryRun: options.dryRun,
        }),
        null,
        2,
      ),
    );
    return;
  }
  if (options.mode === "rollback") {
    console.log(
      JSON.stringify(
        await rollbackUpload({ rollbackPath: options.rollback, dryRun: options.dryRun }),
        null,
        2,
      ),
    );
    return;
  }

  const { inventory, inventoryPath } = await ensureInventory(options);
  if (options.mode === "pilot") {
    console.log(
      JSON.stringify(
        await processSelection({
          mode: "pilot",
          items: selectPilot(inventory, options.pilotCount),
          options,
          inventoryPath,
        }),
        null,
        2,
      ),
    );
    return;
  }
  if (options.mode === "sku") {
    const selected = inventory.items.filter((item) => options.skus.includes(item.sku));
    const missing = options.skus.filter((sku) => !selected.some((item) => item.sku === sku));
    if (missing.length) throw new Error(`SKU no encontrado: ${missing.join(", ")}`);
    console.log(
      JSON.stringify(
        await processSelection({
          mode: "sku",
          items: selected,
          options,
          inventoryPath,
        }),
        null,
        2,
      ),
    );
    return;
  }
  if (options.mode === "pending") {
    if (!options.pilotApproval) {
      throw new Error("--pending requiere --pilot-approval <approval.json>.");
    }
    const gate = await verifyPilotApproval(options.pilotApproval);
    const selected = inventory.items.filter((item) => !isCurrentCatalogStyleImage(item));
    if (selected.length === 0) {
      console.log(
        JSON.stringify(
          {
            mode: "pending",
            run_id: null,
            published: false,
            database_modified: false,
            storage_modified: false,
            message: "El catálogo ya usa catalog-style-v1 en todas sus imágenes.",
            summary: {
              visible_products: inventory.summary.visible_products,
              catalog_images: inventory.items.length,
              pending_images: 0,
            },
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log(
      JSON.stringify(
        await processSelection({
          mode: "pending",
          items: selected,
          options,
          inventoryPath,
          gate,
        }),
        null,
        2,
      ),
    );
    return;
  }
  if (options.mode === "all") {
    if (!options.pilotApproval) {
      throw new Error("--all requiere --pilot-approval <approval.json>.");
    }
    const gate = await verifyPilotApproval(options.pilotApproval);
    console.log(
      JSON.stringify(
        await processSelection({
          mode: "all",
          items: inventory.items,
          options,
          inventoryPath,
          gate,
        }),
        null,
        2,
      ),
    );
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
