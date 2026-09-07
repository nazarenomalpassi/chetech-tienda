import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(SCRIPT_DIR, "..");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".avif"]);
const SKU_PATTERN = /^[A-Z]{2,6}-\d{3}$/;
const BUCKET = "storefront-products";

function usage() {
  return `
Uso:
  node scripts/import-sku-named-product-images.mjs --dry-run --input <carpeta> [--output <carpeta>]
  node scripts/import-sku-named-product-images.mjs --apply --input <carpeta> [--output <carpeta>]
  node scripts/import-sku-named-product-images.mjs --rollback <rollback.json>

La asociacion se obtiene exclusivamente del SKU al inicio del nombre del archivo.
Los sufijos de Windows como " (2)" se ignoran, por lo que ambas fotos quedan en el mismo producto.
`;
}

function parseArgs(argv) {
  const options = { dryRun: false, apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Falta el valor de ${argument}`);
      index += 1;
      return value;
    };
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--apply") options.apply = true;
    else if (argument === "--input") options.input = next();
    else if (argument === "--output") options.output = next();
    else if (argument === "--rollback") options.rollback = next();
    else throw new Error(`Opcion desconocida: ${argument}`);
  }
  if (options.rollback) return options;
  if (options.dryRun === options.apply)
    throw new Error("Elegi exactamente un modo: --dry-run o --apply.");
  if (!options.input) throw new Error("Falta --input con la carpeta de fotos.");
  return options;
}

async function loadEnvFile(filename) {
  try {
    const content = await fs.readFile(filename, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      )
        value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function loadProjectEnvironment() {
  await loadEnvFile(path.join(PROJECT_DIR, ".env.local"));
  await loadEnvFile(path.join(PROJECT_DIR, ".env.development.local"));
}

function createSupabase(write = false) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishable) throw new Error("Faltan las variables publicas de Supabase.");
  if (write && (!secret || secret === publishable))
    throw new Error("--apply y --rollback requieren SUPABASE_SECRET_KEY en el entorno local.");
  return createClient(url, write ? secret : publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function saveJson(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isRetryableRemoteError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.cause?.status ?? 0);
  if (status) return status === 408 || status === 429 || status >= 500;
  const message = String(error?.message ?? error ?? "").toLowerCase();
  return ["fetch failed", "network", "timeout", "timed out", "econnreset", "socket hang up"].some(
    (token) => message.includes(token),
  );
}

async function withRetry(label, operation, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await operation();
      if (result?.error) throw result.error;
      return result;
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryableRemoteError(error)) throw error;
      const delay = 500 * 2 ** (attempt - 1);
      console.warn(`${label}: reintento ${attempt}/${attempts} en ${delay} ms.`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function listImages(root) {
  const resolvedRoot = path.resolve(root);
  const result = [];
  async function walk(directory) {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const fullPath = path.resolve(directory, item.name);
      if (fullPath !== resolvedRoot && !fullPath.startsWith(`${resolvedRoot}${path.sep}`))
        throw new Error(`Ruta fuera de la carpeta: ${fullPath}`);
      if (item.isDirectory()) await walk(fullPath);
      else if (item.isFile() && IMAGE_EXTENSIONS.has(path.extname(item.name).toLowerCase()))
        result.push(fullPath);
    }
  }
  await walk(resolvedRoot);
  return result.sort((left, right) => left.localeCompare(right, "es", { numeric: true }));
}

function skuFromFilename(filename) {
  const stem = path
    .parse(filename)
    .name.trim()
    .replace(/\s*\(\d+\)$/u, "")
    .toUpperCase();
  return SKU_PATTERN.test(stem) ? stem : null;
}

function withoutSourcePath({ source_path: sourcePath, ...row }) {
  void sourcePath;
  return row;
}

async function fetchProducts(client, write) {
  if (write) {
    const response = await withRetry("Consultar productos", () =>
      client
        .from("storefront_products")
        .select("id,sku,name,primary_image_url,archived_at")
        .is("archived_at", null),
    );
    return response.data;
  }
  const response = await withRetry("Consultar catalogo publico", () =>
    client.rpc("get_storefront_products", { p_ids: null, p_slugs: null }),
  );
  return response.data;
}

async function buildInputPlan(input, products) {
  const images = await listImages(input);
  const bySku = new Map(
    products.map((product) => [String(product.sku ?? "").toUpperCase(), product]),
  );
  const rows = images.map((filename) => {
    const sku = skuFromFilename(filename);
    const product = sku ? bySku.get(sku) : null;
    return {
      source_path: filename,
      source_image: path.relative(input, filename).replace(/\\/g, "/"),
      sku,
      product_id: product?.id ?? null,
      product_name: product?.name ?? null,
      current_primary_url: product?.primary_image_url ?? null,
      status: !sku ? "invalid_filename" : !product ? "sku_not_found" : "ready",
    };
  });
  return { images, rows };
}

function createRunDirectory(options, prefix) {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  return path.resolve(
    options.output ??
      path.join(PROJECT_DIR, "reports", "product-image-import", `${prefix}-${runId}`),
  );
}

async function runDryRun(options) {
  const input = path.resolve(options.input);
  if (!(await fs.stat(input)).isDirectory()) throw new Error("La entrada debe ser una carpeta.");
  const client = createSupabase(false);
  const products = await fetchProducts(client, false);
  const { rows } = await buildInputPlan(input, products);
  const readyRows = rows.filter((row) => row.status === "ready");
  const groups = Object.fromEntries(
    [...new Set(readyRows.map((row) => row.sku))]
      .sort()
      .map((sku) => [
        sku,
        readyRows.filter((row) => row.sku === sku).map((row) => row.source_image),
      ]),
  );
  const outputDirectory = createRunDirectory(options, "sku-dry-run");
  const report = {
    summary: {
      mode: "dry-run",
      generated_at: new Date().toISOString(),
      input,
      images_found: rows.length,
      images_ready: readyRows.length,
      unique_skus_ready: Object.keys(groups).length,
      invalid_filenames: rows.filter((row) => row.status === "invalid_filename").length,
      missing_skus: [
        ...new Set(rows.filter((row) => row.status === "sku_not_found").map((row) => row.sku)),
      ].sort(),
      database_modified: false,
      storage_modified: false,
    },
    groups,
    rows: rows.map(withoutSourcePath),
  };
  const reportPath = path.join(outputDirectory, "sku-image-dry-run.json");
  await saveJson(reportPath, report);
  console.log(JSON.stringify({ ...report.summary, report: reportPath }, null, 2));
}

async function optimizeForWeb(filename) {
  return sharp(filename)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84, effort: 5 })
    .toBuffer({ resolveWithObject: true });
}

async function runApply(options) {
  const input = path.resolve(options.input);
  if (!(await fs.stat(input)).isDirectory()) throw new Error("La entrada debe ser una carpeta.");
  const client = createSupabase(true);
  const products = await fetchProducts(client, true);
  const { rows } = await buildInputPlan(input, products);
  const eligible = rows.filter((row) => row.status === "ready");
  if (!eligible.length) throw new Error("No hay fotos con un SKU valido para cargar.");

  const productIds = [...new Set(eligible.map((row) => row.product_id))];
  const existingResponse = await withRetry("Consultar imagenes actuales", () =>
    client
      .from("storefront_product_images")
      .select("id,storefront_product_id,storage_path,public_url,content_hash,is_primary,sort_order")
      .in("storefront_product_id", productIds),
  );
  const existingByProduct = new Map();
  const knownHashes = new Set();
  for (const image of existingResponse.data) {
    const group = existingByProduct.get(image.storefront_product_id) ?? [];
    group.push(image);
    existingByProduct.set(image.storefront_product_id, group);
    if (image.content_hash) knownHashes.add(image.content_hash);
  }

  const outputDirectory = createRunDirectory(options, "sku-apply");
  await fs.mkdir(outputDirectory, { recursive: true });
  const rollbackPath = path.join(outputDirectory, "rollback.json");
  const errorsPath = path.join(outputDirectory, "apply-errors.json");
  const ledger = { generated_at: new Date().toISOString(), input, changes: [] };
  const errors = [];
  const skipped = rows.filter((row) => row.status !== "ready").map(withoutSourcePath);
  const state = new Map(
    products.map((product) => {
      const existing = existingByProduct.get(product.id) ?? [];
      return [
        product.id,
        {
          primaryUrl: product.primary_image_url ?? null,
          hasPrimary: Boolean(
            product.primary_image_url || existing.some((image) => image.is_primary),
          ),
          nextSort: Math.max(-1, ...existing.map((image) => Number(image.sort_order ?? -1))) + 1,
        },
      ];
    }),
  );
  await saveJson(path.join(outputDirectory, "backup-before-apply.json"), {
    products: products.filter((product) => productIds.includes(product.id)),
    existing_images: existingResponse.data,
    skipped,
  });

  const runToken = Date.now().toString(36);
  for (let index = 0; index < eligible.length; index += 1) {
    const row = eligible[index];
    let storagePath = null;
    let insertedId = null;
    try {
      console.log(`[${index + 1}/${eligible.length}] ${row.source_image} -> ${row.sku}`);
      const optimized = await optimizeForWeb(row.source_path);
      const contentHash = createHash("sha256").update(optimized.data).digest("hex");
      if (knownHashes.has(contentHash)) {
        skipped.push({
          source_image: row.source_image,
          sku: row.sku,
          product_id: row.product_id,
          product_name: row.product_name,
          status: "duplicate_content",
        });
        console.log("  Omitida: el contenido ya esta cargado.");
        continue;
      }

      const productState = state.get(row.product_id);
      const isPrimary = !productState.hasPrimary;
      const safeSku = row.sku.toLowerCase();
      storagePath = `${row.product_id}/manual-${safeSku}-${runToken}-${contentHash.slice(0, 12)}.webp`;
      await withRetry("Subir imagen", () =>
        client.storage.from(BUCKET).upload(storagePath, optimized.data, {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: false,
        }),
      );
      const publicUrl = client.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
      const insert = await withRetry("Registrar imagen", () =>
        client
          .from("storefront_product_images")
          .insert({
            storefront_product_id: row.product_id,
            storage_path: storagePath,
            public_url: publicUrl,
            alt_text: row.product_name,
            content_hash: contentHash,
            width: optimized.info.width,
            height: optimized.info.height,
            sort_order: productState.nextSort,
            is_primary: isPrimary,
          })
          .select("id")
          .single(),
      );
      insertedId = insert.data.id;

      if (isPrimary) {
        await withRetry("Actualizar imagen principal", () =>
          client
            .from("storefront_products")
            .update({
              primary_image_url: publicUrl,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.product_id),
        );
      }

      ledger.changes.push({
        product_id: row.product_id,
        product_name: row.product_name,
        image_id: insertedId,
        storage_path: storagePath,
        is_primary: isPrimary,
        previous_primary_url: productState.primaryUrl,
        source_image: row.source_image,
      });
      productState.hasPrimary = true;
      productState.nextSort += 1;
      knownHashes.add(contentHash);
      await saveJson(rollbackPath, ledger);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (insertedId) await client.from("storefront_product_images").delete().eq("id", insertedId);
      if (storagePath) await client.storage.from(BUCKET).remove([storagePath]);
      errors.push({
        source_image: row.source_image,
        sku: row.sku,
        product_id: row.product_id,
        error: message,
      });
      await saveJson(errorsPath, errors);
      console.error(`  Error: ${message}`);
    }
  }

  const report = {
    summary: {
      mode: "apply",
      generated_at: new Date().toISOString(),
      input,
      images_found: rows.length,
      images_applied: ledger.changes.length,
      primary_images_added: ledger.changes.filter((change) => change.is_primary).length,
      secondary_images_added: ledger.changes.filter((change) => !change.is_primary).length,
      skipped: skipped.length,
      failed: errors.length,
    },
    applied: ledger.changes,
    skipped,
    errors,
    rollback: rollbackPath,
  };
  const reportPath = path.join(outputDirectory, "sku-image-apply.json");
  await saveJson(reportPath, report);
  console.log(
    JSON.stringify({ ...report.summary, report: reportPath, rollback: rollbackPath }, null, 2),
  );
}

async function rollbackChanges(filename) {
  const client = createSupabase(true);
  const ledger = JSON.parse(await fs.readFile(path.resolve(filename), "utf8"));
  if (!Array.isArray(ledger?.changes)) throw new Error("El archivo de rollback no es valido.");
  for (const change of [...ledger.changes].reverse()) {
    await withRetry("Eliminar registro", () =>
      client
        .from("storefront_product_images")
        .delete()
        .eq("id", change.image_id)
        .eq("storefront_product_id", change.product_id),
    );
    if (change.is_primary) {
      await withRetry("Restaurar imagen principal", () =>
        client
          .from("storefront_products")
          .update({
            primary_image_url: change.previous_primary_url,
            updated_at: new Date().toISOString(),
          })
          .eq("id", change.product_id),
      );
    }
    await withRetry("Eliminar objeto", () =>
      client.storage.from(BUCKET).remove([change.storage_path]),
    );
  }
  console.log(JSON.stringify({ rolled_back: ledger.changes.length }, null, 2));
}

async function main() {
  await loadProjectEnvironment();
  const options = parseArgs(process.argv.slice(2));
  if (options.rollback) await rollbackChanges(options.rollback);
  else if (options.dryRun) await runDryRun(options);
  else await runApply(options);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error(usage());
  process.exitCode = 1;
});
