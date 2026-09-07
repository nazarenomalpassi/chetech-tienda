import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import unzipper from "unzipper";
import {
  assertSafeArchivePath,
  buildProductEvidence,
  confidenceForCandidates,
  createProposedFilename,
  hammingDistance,
  isGenericFilename,
  qualityScore,
  rankProductCandidates,
  rowsToCsv,
} from "./lib/product-image-import.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(SCRIPT_DIR, "..");
const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
  ".avif",
  ".bmp",
  ".tif",
  ".tiff",
]);
const REPORT_COLUMNS = [
  "product_id",
  "product_name",
  "product_brand",
  "product_model",
  "source_image",
  "proposed_filename",
  "proposed_url",
  "confidence_score",
  "confidence_level",
  "match_reasons",
  "alternative_candidates",
  "current_image",
  "action",
  "status",
  "error",
];
const MAX_ARCHIVE_ENTRIES = 5_000;
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ENTRY_BYTES = 100 * 1024 * 1024;

function usage() {
  return `
Uso:
  node scripts/import-product-images.mjs --dry-run --input <zip-o-carpeta> [opciones]
  node scripts/import-product-images.mjs --apply --input <zip-o-carpeta> --report <reporte.json> [opciones]
  node scripts/import-product-images.mjs --rollback <rollback.json>

Opciones:
  --product-id <uuid>       Procesa un único producto.
  --overrides <archivo>     JSON con asociaciones revisadas manualmente.
  --output <carpeta>        Carpeta para reportes.
  --ocr-lang <idioma>       Idioma de Tesseract (por defecto: eng).
  --skip-ocr                Omite OCR; útil solo para diagnóstico técnico.
  --limit <n>               Limita imágenes para una prueba controlada.
  --force                   Permite agregar una nueva principal si ya existe; requiere CONFIRM_PRODUCT_IMAGE_FORCE=YES.
`;
}

function parseArgs(argv) {
  const parsed = { dryRun: false, apply: false, force: false, skipOcr: false, ocrLang: "eng" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Falta el valor de ${argument}`);
      index += 1;
      return value;
    };
    if (argument === "--dry-run") parsed.dryRun = true;
    else if (argument === "--apply") parsed.apply = true;
    else if (argument === "--force") parsed.force = true;
    else if (argument === "--skip-ocr") parsed.skipOcr = true;
    else if (argument === "--input") parsed.input = next();
    else if (argument === "--product-id") parsed.productId = next();
    else if (argument === "--overrides") parsed.overrides = next();
    else if (argument === "--output") parsed.output = next();
    else if (argument === "--ocr-lang") parsed.ocrLang = next();
    else if (argument === "--limit") parsed.limit = Number.parseInt(next(), 10);
    else if (argument === "--report") parsed.report = next();
    else if (argument === "--rollback") parsed.rollback = next();
    else if (!argument.startsWith("--") && !parsed.input) parsed.input = argument;
    else throw new Error(`Opción desconocida: ${argument}`);
  }
  if (parsed.rollback) return parsed;
  if (parsed.dryRun === parsed.apply)
    throw new Error("Elegí exactamente uno de los modos: --dry-run o --apply.");
  if (!parsed.input) throw new Error("Falta --input con la ruta del ZIP o de una carpeta.");
  if (parsed.apply && !parsed.report)
    throw new Error(
      "--apply requiere el JSON generado previamente mediante --dry-run en --report.",
    );
  if (parsed.force && process.env.CONFIRM_PRODUCT_IMAGE_FORCE !== "YES")
    throw new Error("--force requiere CONFIRM_PRODUCT_IMAGE_FORCE=YES en el entorno local.");
  if (parsed.limit !== undefined && (!Number.isInteger(parsed.limit) || parsed.limit < 1))
    throw new Error("--limit debe ser un entero positivo.");
  return parsed;
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

function createSupabase(mode) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishable)
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  if (mode === "write") {
    if (!secret || secret === publishable)
      throw new Error(
        "--apply y --rollback requieren SUPABASE_SECRET_KEY solamente en el entorno local.",
      );
    return {
      client: createClient(url, secret, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
      url,
      secret: true,
    };
  }
  return {
    client: createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    url,
    secret: false,
  };
}

async function extractZipSafely(zipPath, destination) {
  await fs.mkdir(destination, { recursive: true });
  const archive = createReadStream(zipPath).pipe(unzipper.Parse({ forceStream: true }));
  let entries = 0;
  let totalBytes = 0;
  for await (const entry of archive) {
    entries += 1;
    if (entries > MAX_ARCHIVE_ENTRIES)
      throw new Error(`El ZIP supera el máximo de ${MAX_ARCHIVE_ENTRIES} entradas.`);
    const entryBytes = Number(entry.vars?.uncompressedSize ?? 0);
    totalBytes += entryBytes;
    if (entryBytes > MAX_ENTRY_BYTES || totalBytes > MAX_ARCHIVE_BYTES)
      throw new Error("El ZIP supera los límites de descompresión segura.");
    const destinationPath = assertSafeArchivePath(entry.path, destination);
    if (entry.type === "Directory") {
      await fs.mkdir(destinationPath, { recursive: true });
      entry.autodrain();
      continue;
    }
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await pipeline(entry, createWriteStream(destinationPath, { flags: "wx" }));
  }
  return { entries, totalBytes };
}

async function listImages(root) {
  const result = [];
  async function walk(directory) {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, item.name);
      const resolved = path.resolve(fullPath);
      if (
        !resolved.startsWith(`${path.resolve(root)}${path.sep}`) &&
        resolved !== path.resolve(root)
      )
        throw new Error(`Ruta fuera de la carpeta de entrada: ${fullPath}`);
      if (item.isDirectory()) await walk(fullPath);
      else if (item.isFile() && IMAGE_EXTENSIONS.has(path.extname(item.name).toLowerCase()))
        result.push(fullPath);
    }
  }
  await walk(root);
  return result.sort((left, right) => left.localeCompare(right, "es", { numeric: true }));
}

async function sha256File(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

async function differenceHash(filename) {
  const { data } = await sharp(filename)
    .rotate()
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let bits = "";
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1)
      bits += data[row * 9 + column] > data[row * 9 + column + 1] ? "1" : "0";
  }
  return bits;
}

async function imageFacts(filename) {
  const image = sharp(filename).rotate();
  const [metadata, stats, hash, perceptualHash] = await Promise.all([
    image.metadata(),
    image.stats(),
    sha256File(filename),
    differenceHash(filename),
  ]);
  return { metadata, stats, hash, perceptualHash, quality: qualityScore(metadata, stats) };
}

async function readJsonOr(filename, fallback) {
  if (!filename) return fallback;
  try {
    return JSON.parse(await fs.readFile(path.resolve(filename), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
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
      console.warn(`${label}: intento ${attempt}/${attempts} falló; reintentando en ${delay} ms.`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function fetchProducts(client, productId, withSecret) {
  let rows;
  if (withSecret) {
    let query = client
      .from("storefront_products")
      .select(
        "id,product_id,sku,name,brand,model,category_name,short_description,description,primary_image_url,archived_at,board_code,part_number,compatible_models",
      )
      .is("archived_at", null)
      .order("name");
    if (productId) query = query.eq("id", productId);
    const response = await withRetry("Consultar productos", () => query);
    if (response.error) throw response.error;
    rows = response.data;
  } else {
    const response = await withRetry("Consultar catálogo público", () =>
      client.rpc("get_storefront_products", {
        p_ids: productId ? [productId] : null,
        p_slugs: null,
      }),
    );
    if (response.error) throw response.error;
    rows = response.data;
  }
  if (!Array.isArray(rows) || !rows.length)
    throw new Error(
      productId
        ? "No se encontró el producto solicitado."
        : "No se obtuvieron productos del catálogo.",
    );
  return rows.map((row) => buildProductEvidence(row));
}

function overrideFor(overrides, relativePath) {
  const basename = path.basename(relativePath);
  if (Array.isArray(overrides))
    return overrides.find(
      (item) => item.source_image === relativePath || item.source_image === basename,
    );
  return overrides?.[relativePath] ?? overrides?.[basename] ?? null;
}

async function recognizeImage(worker, filename) {
  const prepared = await sharp(filename)
    .rotate()
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .grayscale()
    .normalize()
    .sharpen()
    .jpeg({ quality: 88 })
    .toBuffer();
  const result = await worker.recognize(prepared);
  return String(result.data?.text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4_000);
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function createContactSheets(images, relativeRoot, outputDirectory) {
  const columns = 3;
  const rows = 4;
  const tileWidth = 400;
  const tileHeight = 330;
  const sheetSize = columns * rows;
  const contactDirectory = path.join(outputDirectory, "contact-sheets");
  await fs.mkdir(contactDirectory, { recursive: true });
  const files = [];
  for (let start = 0; start < images.length; start += sheetSize) {
    const subset = images.slice(start, start + sheetSize);
    const composites = [];
    for (let index = 0; index < subset.length; index += 1) {
      const filename = subset[index];
      const photo = await sharp(filename)
        .rotate()
        .resize(380, 285, { fit: "contain", background: "#f4f4f1" })
        .jpeg({ quality: 78 })
        .toBuffer();
      const label = xmlEscape(path.relative(relativeRoot, filename).replace(/\\/g, "/"));
      const tile = await sharp({
        create: { width: tileWidth, height: tileHeight, channels: 3, background: "#ffffff" },
      })
        .composite([
          { input: photo, top: 5, left: 10 },
          {
            input: Buffer.from(
              `<svg width="400" height="38"><rect width="400" height="38" fill="#111315"/><text x="12" y="25" fill="#d8ff2f" font-family="Arial" font-size="16" font-weight="700">${label}</text></svg>`,
            ),
            top: 292,
            left: 0,
          },
        ])
        .jpeg({ quality: 84 })
        .toBuffer();
      composites.push({
        input: tile,
        left: (index % columns) * tileWidth,
        top: Math.floor(index / columns) * tileHeight,
      });
    }
    const destination = path.join(
      contactDirectory,
      `contact-${String(Math.floor(start / sheetSize) + 1).padStart(2, "0")}.jpg`,
    );
    await sharp({
      create: {
        width: columns * tileWidth,
        height: rows * tileHeight,
        channels: 3,
        background: "#e8e9e6",
      },
    })
      .composite(composites)
      .jpeg({ quality: 86 })
      .toFile(destination);
    files.push(destination);
  }
  return files;
}

function createReportRow({
  product,
  relativePath,
  filename,
  publicUrl,
  confidence,
  reasons,
  alternatives,
  currentImage,
  action,
  status,
  error = "",
}) {
  return {
    product_id: product?.id ?? "",
    product_name: product?.name ?? "",
    product_brand: product?.brand ?? "",
    product_model: product?.model ?? "",
    source_image: relativePath ?? "",
    proposed_filename: filename ?? "",
    proposed_url: publicUrl ?? "",
    confidence_score: Number(confidence?.score ?? 0),
    confidence_level: confidence?.level ?? "low",
    match_reasons: reasons ?? [],
    alternative_candidates: alternatives ?? [],
    current_image: currentImage ?? "",
    action,
    status,
    error,
  };
}

async function runDryRun(options) {
  const { client, url } = createSupabase("read");
  const input = path.resolve(options.input);
  const inputStat = await fs.stat(input);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const workDirectory = path.join(PROJECT_DIR, "tmp", "product-image-import", runId);
  const outputDirectory = path.resolve(
    options.output ?? path.join(PROJECT_DIR, "reports", "product-image-import", runId),
  );
  const imageRoot = inputStat.isDirectory() ? input : path.join(workDirectory, "extracted");
  await fs.mkdir(outputDirectory, { recursive: true });

  if (inputStat.isFile()) {
    if (path.extname(input).toLowerCase() !== ".zip")
      throw new Error("El archivo de entrada debe ser ZIP.");
    console.log("Extrayendo ZIP con validación de rutas y límites...");
    const extraction = await extractZipSafely(input, imageRoot);
    console.log(
      `ZIP extraído: ${extraction.entries} entradas, ${(extraction.totalBytes / 1024 / 1024).toFixed(1)} MB.`,
    );
  }

  let images = await listImages(imageRoot);
  if (options.limit) images = images.slice(0, options.limit);
  if (!images.length) throw new Error("No se encontraron imágenes compatibles.");
  const products = await fetchProducts(client, options.productId, false);
  const productById = new Map(products.map((product) => [String(product.id), product]));
  const productBySku = new Map(
    products.map((product) => [String(product.sku).toUpperCase(), product]),
  );
  const overrides = await readJsonOr(options.overrides, {});
  const cachePath = path.join(PROJECT_DIR, "tmp", "product-image-import", "ocr-cache.json");
  const ocrCache = await readJsonOr(cachePath, {});
  const exactHashFirst = new Map();
  const processed = [];
  let worker = null;

  if (!options.skipOcr) {
    console.log(`Iniciando OCR (${options.ocrLang}); se reutilizará la caché por hash...`);
    worker = await createWorker(options.ocrLang, 1, {
      cachePath: path.join(PROJECT_DIR, "tmp", "product-image-import", "tesseract-cache"),
    });
  }

  try {
    for (let index = 0; index < images.length; index += 1) {
      const filename = images[index];
      const relativePath = path.relative(imageRoot, filename).replace(/\\/g, "/");
      console.log(`[${index + 1}/${images.length}] ${relativePath}`);
      try {
        const facts = await imageFacts(filename);
        let ocrText = ocrCache[facts.hash] ?? "";
        if (worker && !ocrCache[facts.hash]) {
          ocrText = await recognizeImage(worker, filename);
          ocrCache[facts.hash] = ocrText;
          if ((index + 1) % 10 === 0) await saveJson(cachePath, ocrCache);
        }
        const manual = overrideFor(overrides, relativePath);
        const rejectedByReviewer = Boolean(
          manual && (manual.skip === true || manual.approved === false),
        );
        const overrideProduct = manual?.product_id
          ? productById.get(String(manual.product_id))
          : manual?.sku
            ? productBySku.get(String(manual.sku).toUpperCase())
            : null;
        if (manual && !overrideProduct && !rejectedByReviewer)
          throw new Error(`El override no coincide con un producto disponible: ${relativePath}`);
        const filenameEvidence = isGenericFilename(path.basename(filename))
          ? ""
          : path.parse(filename).name;
        const evidenceText = `${filenameEvidence} ${ocrText}`.trim();
        const candidates = rejectedByReviewer
          ? []
          : overrideProduct
            ? [
                {
                  product: overrideProduct,
                  score: 1,
                  exactIdentity: true,
                  matchedNameTokens: [],
                  reasons: [String(manual.reason ?? "Revisión manual")],
                },
              ]
            : rankProductCandidates(products, evidenceText);
        const confidence = rejectedByReviewer
          ? {
              level: "low",
              score: 0,
              reason: `Excluida por revisión manual: ${String(manual.reason ?? "sin coincidencia segura")}`,
            }
          : confidenceForCandidates(candidates, Boolean(overrideProduct));
        const product = candidates[0]?.product ?? null;
        const duplicateOf = exactHashFirst.get(facts.hash) ?? null;
        if (!duplicateOf) exactHashFirst.set(facts.hash, relativePath);
        processed.push({
          filename,
          relativePath,
          ...facts,
          ocrText,
          candidates,
          confidence,
          product,
          duplicateOf,
          manual: Boolean(overrideProduct),
          manualRejected: rejectedByReviewer,
        });
      } catch (error) {
        processed.push({
          filename,
          relativePath,
          error: error instanceof Error ? error.message : String(error),
          confidence: { level: "low", score: 0 },
          candidates: [],
        });
      }
    }
  } finally {
    if (worker) await worker.terminate();
    await saveJson(cachePath, ocrCache);
  }

  for (let left = 0; left < processed.length; left += 1) {
    if (!processed[left].perceptualHash || processed[left].duplicateOf) continue;
    for (let right = 0; right < left; right += 1) {
      if (!processed[right].perceptualHash) continue;
      const distance = hammingDistance(
        processed[left].perceptualHash,
        processed[right].perceptualHash,
      );
      if (distance <= 3 && processed[left].hash !== processed[right].hash) {
        processed[left].possibleVisualDuplicateOf = processed[right].relativePath;
        processed[left].visualDistance = distance;
        break;
      }
    }
  }

  const productImageIndex = new Map();
  const grouped = new Map();
  for (const item of processed) {
    if (!item.product || item.confidence.level !== "high" || item.duplicateOf || item.error)
      continue;
    const group = grouped.get(item.product.id) ?? [];
    group.push(item);
    grouped.set(item.product.id, group);
  }
  for (const group of grouped.values()) {
    group.sort(
      (left, right) =>
        right.quality - left.quality ||
        left.relativePath.localeCompare(right.relativePath, "es", { numeric: true }),
    );
    group.forEach((item, index) => productImageIndex.set(item.relativePath, index));
  }

  const rows = processed.map((item) => {
    if (item.error)
      return createReportRow({
        relativePath: item.relativePath,
        confidence: item.confidence,
        action: "error",
        status: "processing_error",
        error: item.error,
      });
    const product = item.product;
    const imageIndex = product ? (productImageIndex.get(item.relativePath) ?? 0) : 0;
    const proposedFilename = product ? createProposedFilename(product, item.hash, imageIndex) : "";
    const storagePath = product ? `${product.id}/${proposedFilename}` : "";
    const publicUrl = storagePath
      ? `${url}/storage/v1/object/public/storefront-products/${storagePath}`
      : "";
    const alternatives = item.candidates.slice(1, 4).map((candidate) => ({
      product_id: candidate.product.id,
      name: candidate.product.name,
      sku: candidate.product.sku,
      score: candidate.score,
    }));
    const reasons = [...(item.candidates[0]?.reasons ?? []), item.confidence.reason];
    if (item.ocrText) reasons.push(`OCR: ${item.ocrText.slice(0, 240)}`);
    if (item.duplicateOf) reasons.push(`Duplicado exacto de ${item.duplicateOf}`);
    if (item.possibleVisualDuplicateOf)
      reasons.push(
        `Posible duplicado visual de ${item.possibleVisualDuplicateOf} (distancia ${item.visualDistance})`,
      );
    const hasCurrent = Boolean(product?.primary_image_url);
    let action =
      item.confidence.level === "high"
        ? imageIndex === 0
          ? "assign_primary"
          : "assign_secondary"
        : "manual_review";
    let status = item.confidence.level === "high" ? "proposed" : "pending_review";
    if (!product) {
      action = "manual_review";
      status = "unidentified";
    }
    if (item.duplicateOf) {
      action = "skip_duplicate";
      status = "duplicate";
    }
    if (hasCurrent && !options.force) {
      action = "skip_existing";
      status = "skipped";
    }
    return createReportRow({
      product,
      relativePath: item.relativePath,
      filename: proposedFilename,
      publicUrl,
      confidence: item.confidence,
      reasons,
      alternatives,
      currentImage: product?.primary_image_url,
      action,
      status,
    });
  });

  const safelyMatchedProductIds = new Set(
    rows
      .filter(
        (row) => row.confidence_level === "high" && row.product_id && row.status === "proposed",
      )
      .map((row) => row.product_id),
  );
  const productsWithoutImage = products
    .filter((product) => !product.primary_image_url && !safelyMatchedProductIds.has(product.id))
    .map((product) =>
      createReportRow({
        product,
        confidence: { level: "low", score: 0 },
        currentImage: "",
        action: "no_image_found",
        status: "product_without_image",
        reasons: ["No se encontró una asociación de confianza alta"],
      }),
    );
  const allRows = [...rows, ...productsWithoutImage];
  const sections = {
    safe_associations: rows.filter(
      (row) => row.confidence_level === "high" && row.status === "proposed",
    ),
    doubtful_associations: rows.filter(
      (row) => ["medium", "low"].includes(row.confidence_level) && row.status === "pending_review",
    ),
    unidentified_images: rows.filter((row) => row.status === "unidentified"),
    products_without_image: productsWithoutImage,
    duplicate_images: rows.filter((row) => row.status === "duplicate"),
    processing_errors: rows.filter((row) => row.status === "processing_error"),
  };
  const summary = {
    mode: "dry-run",
    generated_at: new Date().toISOString(),
    input,
    images_analyzed: images.length,
    products_analyzed: products.length,
    confidence_high: rows.filter((row) => row.confidence_level === "high").length,
    confidence_medium: rows.filter((row) => row.confidence_level === "medium").length,
    confidence_low: rows.filter((row) => row.confidence_level === "low").length,
    safe_associations: sections.safe_associations.length,
    unidentified_images: sections.unidentified_images.length,
    products_without_image: sections.products_without_image.length,
    duplicate_images: sections.duplicate_images.length,
    processing_errors: sections.processing_errors.length,
    database_modified: false,
    storage_modified: false,
  };
  const report = {
    summary,
    products_snapshot: products.map((product) => ({
      id: product.id,
      product_id: product.product_id,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      model: product.model,
      category_name: product.category_name,
      current_image: product.primary_image_url ?? null,
    })),
    sections,
    all_rows: allRows,
  };
  const jsonPath = path.join(outputDirectory, "product-image-dry-run.json");
  const csvPath = path.join(outputDirectory, "product-image-dry-run.csv");
  await saveJson(jsonPath, report);
  await fs.writeFile(csvPath, rowsToCsv(allRows, REPORT_COLUMNS), "utf8");
  await saveJson(path.join(outputDirectory, "review-overrides.template.json"), {
    "productos local/IMG_0001.JPG": {
      sku: "AUR-001",
      reason: "Marca y modelo verificados visualmente",
      approved: true,
    },
    "productos local/IMG_0002.JPG": {
      skip: true,
      reason: "El producto no existe o la foto es ambigua",
      approved: false,
    },
  });
  const contactSheets = await createContactSheets(images, imageRoot, outputDirectory);
  console.log(
    JSON.stringify(
      {
        ...summary,
        json_report: jsonPath,
        csv_report: csvPath,
        contact_sheets: contactSheets.length,
      },
      null,
      2,
    ),
  );
}

async function optimizeForWeb(filename) {
  return sharp(filename)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84, effort: 5 })
    .toBuffer({ resolveWithObject: true });
}

async function applyReviewedReport(options) {
  const { client } = createSupabase("write");
  const report = await readJsonOr(options.report, null);
  if (!report?.summary || report.summary.mode !== "dry-run" || !Array.isArray(report.all_rows))
    throw new Error("El archivo de --report no es un reporte dry-run válido.");
  const input = path.resolve(options.input);
  const inputStat = await fs.stat(input);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const workDirectory = path.join(PROJECT_DIR, "tmp", "product-image-import", `apply-${runId}`);
  const imageRoot = inputStat.isDirectory() ? input : path.join(workDirectory, "extracted");
  if (inputStat.isFile()) await extractZipSafely(input, imageRoot);
  const images = await listImages(imageRoot);
  const sourceByRelativePath = new Map(
    images.map((filename) => [path.relative(imageRoot, filename).replace(/\\/g, "/"), filename]),
  );
  const eligible = report.all_rows.filter(
    (row) =>
      row.confidence_level === "high" &&
      row.status === "proposed" &&
      row.product_id &&
      row.source_image &&
      (!options.productId || row.product_id === options.productId),
  );
  if (!eligible.length)
    throw new Error("El reporte no contiene asociaciones de confianza alta elegibles.");
  const productIds = [...new Set(eligible.map((row) => row.product_id))];
  const productsResponse = await withRetry("Consultar productos", () =>
    client.from("storefront_products").select("id,name,primary_image_url").in("id", productIds),
  );
  const products = new Map(productsResponse.data.map((product) => [product.id, product]));
  const existingResponse = await withRetry("Consultar imágenes existentes", () =>
    client
      .from("storefront_product_images")
      .select("id,storefront_product_id,storage_path,public_url,is_primary,sort_order")
      .in("storefront_product_id", productIds),
  );
  const existingByProduct = new Map();
  for (const image of existingResponse.data) {
    const group = existingByProduct.get(image.storefront_product_id) ?? [];
    group.push(image);
    existingByProduct.set(image.storefront_product_id, group);
  }

  const outputDirectory = path.resolve(
    options.output ?? path.join(PROJECT_DIR, "reports", "product-image-import", `apply-${runId}`),
  );
  await fs.mkdir(outputDirectory, { recursive: true });
  const ledgerPath = path.join(outputDirectory, "rollback.json");
  const errorPath = path.join(outputDirectory, "apply-errors.json");
  const ledger = {
    generated_at: new Date().toISOString(),
    source_report: path.resolve(options.report),
    changes: [],
  };
  const applyErrors = [];
  await saveJson(
    path.join(outputDirectory, "backup-before-apply.json"),
    eligible.map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      previous_image: products.get(row.product_id)?.primary_image_url ?? null,
      source_image: row.source_image,
      new_url: row.proposed_url,
      confidence: row.confidence_level,
    })),
  );

  for (let index = 0; index < eligible.length; index += 1) {
    const row = eligible[index];
    try {
      const source = sourceByRelativePath.get(row.source_image);
      if (!source)
        throw new Error(
          `No se encontró la imagen del reporte dentro de la entrada: ${row.source_image}`,
        );
      const product = products.get(row.product_id);
      if (!product) throw new Error(`El producto ya no existe: ${row.product_id}`);
      const existing = existingByProduct.get(row.product_id) ?? [];
      const previousPrimary = existing.find((image) => image.is_primary) ?? null;
      const wantsPrimary = row.action === "assign_primary";
      if ((product.primary_image_url || previousPrimary) && wantsPrimary && !options.force) {
        console.log(
          `[${index + 1}/${eligible.length}] Omitido por imagen existente: ${row.product_name}`,
        );
        continue;
      }
      console.log(
        `[${index + 1}/${eligible.length}] Subiendo ${row.source_image} -> ${row.product_name}`,
      );
      const optimized = await optimizeForWeb(source);
      const contentHash = createHash("sha256").update(optimized.data).digest("hex");
      const metadata = optimized.info;
      const storagePath = `${row.product_id}/${row.proposed_filename}`;
      const upload = await withRetry("Subir imagen", () =>
        client.storage.from("storefront-products").upload(storagePath, optimized.data, {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: false,
        }),
      );
      if (upload.error) throw upload.error;
      const publicUrl = client.storage.from("storefront-products").getPublicUrl(storagePath)
        .data.publicUrl;
      let insertedId = null;
      try {
        if (wantsPrimary && previousPrimary && options.force) {
          const demote = await withRetry("Desmarcar imagen principal anterior", () =>
            client
              .from("storefront_product_images")
              .update({ is_primary: false })
              .eq("id", previousPrimary.id),
          );
          if (demote.error) throw demote.error;
        }
        const insert = await withRetry("Registrar imagen", () =>
          client
            .from("storefront_product_images")
            .insert({
              storefront_product_id: row.product_id,
              storage_path: storagePath,
              public_url: publicUrl,
              alt_text: row.product_name,
              content_hash: contentHash,
              width: metadata.width,
              height: metadata.height,
              sort_order: existing.length + index,
              is_primary: wantsPrimary,
            })
            .select("id")
            .single(),
        );
        if (insert.error) throw insert.error;
        insertedId = insert.data.id;
        if (wantsPrimary) {
          const update = await withRetry("Actualizar imagen principal", () =>
            client
              .from("storefront_products")
              .update({ primary_image_url: publicUrl, updated_at: new Date().toISOString() })
              .eq("id", row.product_id),
          );
          if (update.error) throw update.error;
        }
        ledger.changes.push({
          product_id: row.product_id,
          image_id: insertedId,
          storage_path: storagePath,
          is_primary: wantsPrimary,
          previous_primary_url: product.primary_image_url ?? null,
          previous_primary_image_id: previousPrimary?.id ?? null,
        });
        await saveJson(ledgerPath, ledger);
      } catch (error) {
        if (insertedId)
          await withRetry("Compensar registro de imagen", () =>
            client.from("storefront_product_images").delete().eq("id", insertedId),
          );
        await withRetry("Compensar objeto de Storage", () =>
          client.storage.from("storefront-products").remove([storagePath]),
        );
        if (wantsPrimary)
          await withRetry("Restaurar URL principal anterior", () =>
            client
              .from("storefront_products")
              .update({
                primary_image_url: product.primary_image_url ?? null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", row.product_id),
          );
        if (previousPrimary && wantsPrimary && options.force)
          await withRetry("Restaurar imagen principal anterior", () =>
            client
              .from("storefront_product_images")
              .update({ is_primary: true })
              .eq("id", previousPrimary.id),
          );
        throw error;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      applyErrors.push({
        product_id: row.product_id,
        product_name: row.product_name,
        source_image: row.source_image,
        error: message,
      });
      await saveJson(errorPath, applyErrors);
      console.error(`[${index + 1}/${eligible.length}] Error: ${message}`);
    }
  }
  console.log(
    JSON.stringify(
      {
        applied: ledger.changes.length,
        failed: applyErrors.length,
        rollback: ledgerPath,
        errors: applyErrors.length ? errorPath : null,
      },
      null,
      2,
    ),
  );
}

async function rollbackChanges(filename) {
  const { client } = createSupabase("write");
  const ledger = await readJsonOr(filename, null);
  if (!ledger || !Array.isArray(ledger.changes))
    throw new Error("El archivo de rollback no es válido.");
  for (const change of [...ledger.changes].reverse()) {
    const removeRow = await withRetry("Eliminar registro durante rollback", () =>
      client
        .from("storefront_product_images")
        .delete()
        .eq("id", change.image_id)
        .eq("storefront_product_id", change.product_id),
    );
    if (removeRow.error) throw removeRow.error;
    if (change.is_primary) {
      const restoreProduct = await withRetry("Restaurar producto durante rollback", () =>
        client
          .from("storefront_products")
          .update({
            primary_image_url: change.previous_primary_url,
            updated_at: new Date().toISOString(),
          })
          .eq("id", change.product_id),
      );
      if (restoreProduct.error) throw restoreProduct.error;
      if (change.previous_primary_image_id) {
        const restoreImage = await withRetry("Restaurar imagen durante rollback", () =>
          client
            .from("storefront_product_images")
            .update({ is_primary: true })
            .eq("id", change.previous_primary_image_id),
        );
        if (restoreImage.error) throw restoreImage.error;
      }
    }
    const removeStorage = await withRetry("Eliminar objeto durante rollback", () =>
      client.storage.from("storefront-products").remove([change.storage_path]),
    );
    if (removeStorage.error) throw removeStorage.error;
  }
  console.log(JSON.stringify({ rolled_back: ledger.changes.length }, null, 2));
}

async function main() {
  await loadProjectEnvironment();
  const options = parseArgs(process.argv.slice(2));
  if (options.rollback) await rollbackChanges(path.resolve(options.rollback));
  else if (options.dryRun) await runDryRun(options);
  else await applyReviewedReport(options);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error(usage());
  process.exitCode = 1;
});
