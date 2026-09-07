import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(SCRIPT_DIR, "../..");
const PIPELINE = path.join(SCRIPT_DIR, "catalog-images.mjs");
const STYLE_ROOT = path.join(PROJECT_DIR, "outputs", "catalog-images", "catalog-style-v1");

function usage() {
  return `
Unificación de fotos del catálogo Chetech.

Procesar solamente fotos nuevas o todavía no normalizadas:
  npm run images:unify

Comprobar y respaldar el catálogo sin procesar:
  npm run images:unify -- --check

Forzar el reprocesamiento de todo el catálogo:
  npm run images:unify -- --all

Procesar productos puntuales, incluyendo su galería completa:
  npm run images:unify -- --sku AUR-003 --sku VAR-043

Publicar un lote revisado:
  npm run images:unify -- --publish --manifest <manifest.json> --approval <approval.json>

Revertir una publicación:
  npm run images:unify -- --rollback <upload-rollback.json>

Opciones:
  --pilot-approval <archivo>  Aprobación del estilo. Por defecto usa el último piloto.
  --overrides <archivo>       Excepciones revisadas de fuente, recorte o máscara.
  --config <archivo>          Configuración visual versionada.
  --output <carpeta>          Carpeta de salida del procesamiento.
  --no-report                 No genera la revisión visual HTML.
  --dry-run                   En publicación o rollback, valida sin escribir.
`;
}

function takeValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Falta el valor de ${option}.`);
  return value;
}

export function parseWorkflowArgs(argv) {
  const options = {
    mode: "pending",
    skus: [],
    passthrough: [],
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--check") options.mode = "check";
    else if (argument === "--all") options.mode = "all";
    else if (argument === "--sku") {
      options.mode = "sku";
      options.skus.push(takeValue(argv, index, argument).toUpperCase());
      index += 1;
    } else if (argument === "--publish") options.mode = "publish";
    else if (argument === "--rollback") {
      options.mode = "rollback";
      options.rollback = takeValue(argv, index, argument);
      index += 1;
    } else if (argument === "--pilot-approval") {
      options.pilotApproval = takeValue(argv, index, argument);
      index += 1;
    } else if (argument === "--manifest") {
      options.manifest = takeValue(argv, index, argument);
      index += 1;
    } else if (argument === "--approval") {
      options.approval = takeValue(argv, index, argument);
      index += 1;
    } else if (["--overrides", "--config", "--output"].includes(argument)) {
      options.passthrough.push(argument, takeValue(argv, index, argument));
      index += 1;
    } else if (argument === "--no-report") options.passthrough.push(argument);
    else if (argument === "--dry-run") options.dryRun = true;
    else throw new Error(`Opción desconocida: ${argument}`);
  }
  if (options.mode === "sku" && options.skus.length === 0) {
    throw new Error("--sku requiere al menos un SKU.");
  }
  if (options.mode === "publish" && (!options.manifest || !options.approval)) {
    throw new Error("--publish requiere --manifest y --approval.");
  }
  return options;
}

async function fileExists(filename) {
  try {
    return (await fs.stat(filename)).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function resolvePilotApproval(explicitPath = null) {
  if (explicitPath) {
    const resolved = path.resolve(explicitPath);
    if (!(await fileExists(resolved))) {
      throw new Error(`No existe la aprobación indicada: ${resolved}`);
    }
    return resolved;
  }
  const latestPath = path.join(STYLE_ROOT, "latest-pilot.json");
  const latest = JSON.parse(await fs.readFile(latestPath, "utf8"));
  const candidate = path.join(path.resolve(latest.output), "review", "approval.user-approved.json");
  if (!(await fileExists(candidate))) {
    throw new Error(
      `El último piloto no tiene aprobación. Revisá ${latest.manifest} y guardá approval.user-approved.json.`,
    );
  }
  return candidate;
}

export async function buildPipelineArgs(options) {
  if (options.mode === "check") return ["--dry-run"];
  if (options.mode === "publish") {
    return [
      "--upload",
      "--manifest",
      path.resolve(options.manifest),
      "--approval",
      path.resolve(options.approval),
      ...(options.dryRun ? ["--dry-run"] : []),
    ];
  }
  if (options.mode === "rollback") {
    return ["--rollback", path.resolve(options.rollback), ...(options.dryRun ? ["--dry-run"] : [])];
  }

  const common = ["--refresh-inventory", "--production-source", ...options.passthrough];
  if (options.mode === "sku") {
    return [...options.skus.flatMap((sku) => ["--sku", sku]), ...common];
  }
  const pilotApproval = await resolvePilotApproval(options.pilotApproval);
  return [
    options.mode === "all" ? "--all" : "--pending",
    "--pilot-approval",
    pilotApproval,
    ...common,
  ];
}

function runPipeline(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PIPELINE, ...args], {
      cwd: PROJECT_DIR,
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`La unificación terminó con código ${code}.`));
    });
  });
}

async function main() {
  const options = parseWorkflowArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const args = await buildPipelineArgs(options);
  await runPipeline(args);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
