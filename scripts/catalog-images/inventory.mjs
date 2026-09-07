import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createReadOnlyCatalogClient, PROJECT_ROOT } from "./env.mjs";
import { createSourceResolver, mimeFromFormat } from "./source-resolver.mjs";

export const PIPELINE_VERSION = "catalog-images-inventory-v1";
export const DEFAULT_BUCKET = "storefront-products";

const IMAGE_SELECT =
  "id,storefront_product_id,storage_path,public_url,content_hash,width,height,sort_order,is_primary";
const PRODUCT_SELECT = "id,sku,name,primary_image_url";

function normalizeStoragePath(value) {
  return String(value ?? "")
    .replace(/\\/gu, "/")
    .replace(/^\/+/u, "");
}

function storagePathFromPublicUrl(value, bucket = DEFAULT_BUCKET) {
  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    const marker = `/object/public/${bucket}/`;
    const markerIndex = pathname.indexOf(marker);
    return markerIndex >= 0
      ? normalizeStoragePath(pathname.slice(markerIndex + marker.length))
      : null;
  } catch {
    return null;
  }
}

export function resolveStorageBackupPath(backupRoot, storagePath) {
  const portable = normalizeStoragePath(storagePath);
  const normalized = path.posix.normalize(portable);
  if (
    !portable ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.startsWith("/") ||
    /^[a-z]:/iu.test(normalized)
  ) {
    throw new Error(`Ruta de Storage insegura: ${storagePath}`);
  }
  const root = path.resolve(backupRoot);
  const resolved = path.resolve(root, ...normalized.split("/"));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`La ruta de Storage sale del backup: ${storagePath}`);
  }
  return resolved;
}

function hashBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function hashFile(filename) {
  const hash = createHash("sha256");
  const handle = await fs.open(filename, "r");
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk);
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

async function pathExists(filename) {
  try {
    await fs.access(filename);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function inspectBackedUpImage(localPath, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // libvips on Windows cannot open some paths beyond MAX_PATH even though
      // node:fs can. Reading once also makes the metadata and hash refer to the
      // exact same bytes.
      const [buffer, stat] = await Promise.all([fs.readFile(localPath), fs.stat(localPath)]);
      const metadata = await sharp(buffer, { failOn: "warning" }).metadata();
      const sha256 = hashBuffer(buffer);
      return { metadata, stat, sha256 };
    } catch (error) {
      lastError = error;
      if (error?.code !== "ENOENT" || attempt === attempts) break;
      // OneDrive can expose a newly-created directory entry a fraction later
      // to another native process (Sharp/libvips). The file is never rewritten.
      await new Promise((resolve) => setTimeout(resolve, 75 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

async function withRetry(label, operation, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const status = Number(error?.status ?? error?.statusCode ?? error?.cause?.status ?? 0);
      const retryable =
        [408, 425, 429].includes(status) ||
        status >= 500 ||
        /fetch failed|network|timeout|econnreset|socket hang up/iu.test(
          String(error?.message ?? error),
        );
      if (!retryable || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(`${label}: ${lastError?.message ?? lastError}`, { cause: lastError });
}

async function fetchDirectTables(client) {
  const [productResponse, imageResponse] = await Promise.all([
    client
      .from("storefront_products")
      .select(PRODUCT_SELECT)
      .eq("is_published", true)
      .is("archived_at", null)
      .gt("public_price", 0)
      .order("sku", { ascending: true }),
    client
      .from("storefront_product_images")
      .select(IMAGE_SELECT)
      .order("storefront_product_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (productResponse.error) throw productResponse.error;
  if (imageResponse.error) throw imageResponse.error;
  return {
    accessMode: "direct_tables",
    products: productResponse.data ?? [],
    images: imageResponse.data ?? [],
  };
}

async function fetchViaPublicRpc(client, bucket, resolver) {
  const response = await client.rpc("get_storefront_products", {
    p_ids: null,
    p_slugs: null,
  });
  if (response.error) throw response.error;

  const products = response.data ?? [];
  const images = [];
  for (const product of products) {
    const urls = Array.isArray(product.image_urls) ? product.image_urls : [];
    for (let index = 0; index < urls.length; index += 1) {
      const publicUrl = urls[index];
      const storagePath = storagePathFromPublicUrl(publicUrl, bucket);
      const ledger = resolver.ledgerMetadata(storagePath);
      images.push({
        id: ledger?.image_id ?? null,
        storefront_product_id: product.id,
        storage_path: storagePath,
        public_url: publicUrl,
        content_hash: ledger?.content_hash ?? null,
        width: ledger?.width ?? null,
        height: ledger?.height ?? null,
        sort_order: index,
        is_primary:
          publicUrl === product.primary_image_url ||
          (!product.primary_image_url && index === 0) ||
          Boolean(ledger?.is_primary && index === 0),
        _anonymous_contract: true,
      });
    }
  }
  return {
    accessMode: "public_rpc",
    products: products.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      primary_image_url: product.primary_image_url,
    })),
    images,
  };
}

async function fetchCatalogState(client, bucket, resolver) {
  try {
    return await fetchDirectTables(client);
  } catch (error) {
    const permissionDenied =
      String(error?.code ?? "") === "42501" ||
      /permission denied|not allowed|row-level security/iu.test(String(error?.message ?? error));
    if (!permissionDenied) throw error;
    return fetchViaPublicRpc(client, bucket, resolver);
  }
}

async function downloadProductionImage({ image, backupRoot, downloadProduction, expectedSha256 }) {
  const warnings = [];
  const storagePath = normalizeStoragePath(
    image.storage_path ?? storagePathFromPublicUrl(image.public_url),
  );
  if (!storagePath) throw new Error(`No se pudo resolver storage_path para ${image.public_url}`);
  const localPath = resolveStorageBackupPath(backupRoot, storagePath);
  let downloadStatus = "metadata_only";

  if (downloadProduction) {
    if (await pathExists(localPath)) {
      const existingHash = await hashFile(localPath);
      if (expectedSha256 && existingHash !== expectedSha256) {
        throw new Error(
          `El backup inmutable existente no coincide con el hash registrado: ${storagePath}`,
        );
      }
      downloadStatus = "reused_immutable_backup";
    } else {
      const response = await withRetry(`Descargar ${storagePath}`, async () => {
        const result = await fetch(image.public_url, {
          headers: { Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
        });
        if (!result.ok) {
          const error = new Error(`HTTP ${result.status} al descargar ${storagePath}`);
          error.status = result.status;
          throw error;
        }
        return result;
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      const remoteHash = hashBuffer(buffer);
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      try {
        await fs.writeFile(localPath, buffer, { flag: "wx" });
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const concurrentHash = await hashFile(localPath);
        if (concurrentHash !== remoteHash) {
          throw new Error(`Conflicto al crear el backup inmutable: ${storagePath}`);
        }
      }
      downloadStatus = "downloaded";
    }
  }

  if (!(await pathExists(localPath))) {
    return {
      storagePath,
      localPath: null,
      sha256: image.content_hash ?? null,
      width: image.width ?? null,
      height: image.height ?? null,
      bytes: null,
      mime: mimeFromFilename(storagePath),
      warnings,
      downloadStatus,
    };
  }

  const { metadata, stat, sha256 } = await inspectBackedUpImage(localPath);
  if (image.content_hash && image.content_hash !== sha256) {
    warnings.push("production_hash_differs_from_database_content_hash");
  }
  if (image.width && Number(image.width) !== Number(metadata.width)) {
    warnings.push("production_width_differs_from_database");
  }
  if (image.height && Number(image.height) !== Number(metadata.height)) {
    warnings.push("production_height_differs_from_database");
  }
  return {
    storagePath,
    localPath,
    sha256,
    width: metadata.width ?? image.width ?? null,
    height: metadata.height ?? image.height ?? null,
    bytes: stat.size,
    mime: mimeFromFormat(metadata.format) ?? mimeFromFilename(storagePath),
    warnings,
    downloadStatus,
  };
}

function mimeFromFilename(filename) {
  const extension = path.extname(String(filename ?? "")).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".avif") return "image/avif";
  if (extension === ".heif" || extension === ".heic") return "image/heic";
  return null;
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const result = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, values.length)) }, () => worker()),
  );
  return result;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function inventoryToCsv(items) {
  const columns = [
    "image_id",
    "product_id",
    "sku",
    "product_name",
    "is_primary",
    "position",
    "production_storage_path",
    "production_url",
    "production_local_path",
    "production_sha256",
    "production_width",
    "production_height",
    "production_bytes",
    "production_mime",
    "source_local_path",
    "source_sha256",
    "source_width",
    "source_height",
    "source_bytes",
    "source_provenance",
    "source_resolution_status",
    "warnings",
  ];
  const rows = items.map((item) => ({
    image_id: item.image_id,
    product_id: item.product_id,
    sku: item.sku,
    product_name: item.product_name,
    is_primary: item.is_primary,
    position: item.position,
    production_storage_path: item.production.storage_path,
    production_url: item.production.url,
    production_local_path: item.production.local_path,
    production_sha256: item.production.sha256,
    production_width: item.production.width,
    production_height: item.production.height,
    production_bytes: item.production.bytes,
    production_mime: item.production.mime,
    source_local_path: item.source?.local_path,
    source_sha256: item.source?.sha256,
    source_width: item.source?.width,
    source_height: item.source?.height,
    source_bytes: item.source?.bytes,
    source_provenance: item.source?.provenance,
    source_resolution_status: item.source?.resolution_status,
    warnings: item.warnings,
  }));
  return `\uFEFF${[
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\r\n")}\r\n`;
}

export function summarizeInventory(items, products, accessMode) {
  const imagesPerProduct = new Map();
  for (const item of items) {
    imagesPerProduct.set(item.product_id, (imagesPerProduct.get(item.product_id) ?? 0) + 1);
  }
  const productionBytes = items.reduce(
    (total, item) => total + Number(item.production.bytes ?? 0),
    0,
  );
  const sourceBytes = items.reduce((total, item) => total + Number(item.source?.bytes ?? 0), 0);
  return {
    access_mode: accessMode,
    visible_products: products.length,
    image_rows: items.length,
    primary_images: items.filter((item) => item.is_primary).length,
    secondary_images: items.filter((item) => !item.is_primary).length,
    products_with_multiple_images: [...imagesPerProduct.values()].filter((count) => count > 1)
      .length,
    products_without_images: products.filter((product) => !imagesPerProduct.has(product.id)).length,
    sources_resolved: items.filter((item) => item.source).length,
    sources_missing: items.filter((item) => !item.source).length,
    production_downloaded: items.filter((item) => item.production.download_status === "downloaded")
      .length,
    production_backups_reused: items.filter(
      (item) => item.production.download_status === "reused_immutable_backup",
    ).length,
    production_bytes: productionBytes,
    source_bytes: sourceBytes,
    warning_count: items.reduce((total, item) => total + item.warnings.length, 0),
  };
}

async function atomicWrite(filename, content) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, content);
  await fs.rename(temporary, filename);
}

export async function buildInventory({
  outputRoot = path.join(
    PROJECT_ROOT,
    "outputs",
    "catalog-images",
    "catalog-style-v1",
    "inventory",
  ),
  downloadProduction = true,
  projectRoot = PROJECT_ROOT,
  bucket = DEFAULT_BUCKET,
  concurrency = 6,
} = {}) {
  const resolvedOutputRoot = path.resolve(outputRoot);
  const backupRoot = path.join(resolvedOutputRoot, "production-backup");
  const previousInventory = await readInventoryIfPresent(
    path.join(resolvedOutputRoot, "inventory.json"),
  );
  const previousHashes = new Map(
    (previousInventory?.items ?? []).map((item) => [
      normalizeStoragePath(item.production?.storage_path),
      item.production?.sha256 ?? null,
    ]),
  );
  const [{ client, environment }, resolver] = await Promise.all([
    createReadOnlyCatalogClient({ projectRoot }),
    createSourceResolver({ projectRoot }),
  ]);
  const state = await fetchCatalogState(client, bucket, resolver);
  const productsById = new Map(state.products.map((product) => [product.id, product]));
  const orderedImages = [...state.images].sort((left, right) => {
    const leftProduct = productsById.get(left.storefront_product_id);
    const rightProduct = productsById.get(right.storefront_product_id);
    return (
      String(leftProduct?.sku ?? "").localeCompare(String(rightProduct?.sku ?? ""), "es", {
        numeric: true,
      }) ||
      Number(right.is_primary) - Number(left.is_primary) ||
      Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0) ||
      String(left.id ?? "").localeCompare(String(right.id ?? ""), "en")
    );
  });

  const items = await mapWithConcurrency(orderedImages, concurrency, async (image) => {
    const product = productsById.get(image.storefront_product_id);
    if (!product) throw new Error(`Imagen sin producto visible: ${image.id ?? image.public_url}`);
    const production = await downloadProductionImage({
      image,
      backupRoot,
      downloadProduction,
      expectedSha256:
        image.content_hash ?? previousHashes.get(normalizeStoragePath(image.storage_path)) ?? null,
    });
    const source = await resolver.resolve(production.storagePath);
    const warnings = [...production.warnings];
    if (image._anonymous_contract && !image.id) {
      warnings.push("image_id_not_exposed_by_public_rpc");
    }
    if (image._anonymous_contract) {
      warnings.push("position_inferred_from_public_gallery_order");
    }
    if (!source) warnings.push("highest_resolution_local_source_not_resolved");
    if (
      source &&
      Number(source.width ?? 0) * Number(source.height ?? 0) <
        Number(production.width ?? 0) * Number(production.height ?? 0)
    ) {
      warnings.push("resolved_source_has_lower_resolution_than_production");
    }
    return {
      image_id: image.id ?? null,
      product_id: product.id,
      sku: product.sku,
      product_name: product.name,
      is_primary: Boolean(image.is_primary),
      position: Number(image.sort_order ?? 0),
      production: {
        url: image.public_url,
        storage_path: production.storagePath,
        local_path: production.localPath,
        sha256: production.sha256,
        width: production.width,
        height: production.height,
        bytes: production.bytes,
        mime: production.mime,
        download_status: production.downloadStatus,
      },
      source,
      warnings: [...new Set(warnings)],
    };
  });

  const inventory = {
    pipeline_version: PIPELINE_VERSION,
    generated_at: new Date().toISOString(),
    project: environment.projectRef,
    bucket,
    summary: summarizeInventory(items, state.products, state.accessMode),
    items,
  };
  await Promise.all([
    atomicWrite(
      path.join(resolvedOutputRoot, "inventory.json"),
      `${JSON.stringify(inventory, null, 2)}\n`,
    ),
    atomicWrite(path.join(resolvedOutputRoot, "inventory.csv"), inventoryToCsv(items)),
    atomicWrite(
      path.join(resolvedOutputRoot, "summary.json"),
      `${JSON.stringify(inventory.summary, null, 2)}\n`,
    ),
  ]);
  return inventory;
}

export async function readInventory(filename) {
  const inventory = JSON.parse(await fs.readFile(filename, "utf8"));
  if (
    !inventory ||
    typeof inventory !== "object" ||
    !Array.isArray(inventory.items) ||
    !inventory.summary
  ) {
    throw new Error(`Inventario invalido: ${filename}`);
  }
  return inventory;
}

async function readInventoryIfPresent(filename) {
  try {
    return await readInventory(filename);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function parseCliArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--no-download") options.downloadProduction = false;
    else if (argument === "--output") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("Falta el valor de --output.");
      options.outputRoot = value;
      index += 1;
    } else if (argument === "--concurrency") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 24) {
        throw new Error("--concurrency debe ser un entero entre 1 y 24.");
      }
      options.concurrency = value;
      index += 1;
    } else {
      throw new Error(`Opcion desconocida: ${argument}`);
    }
  }
  return options;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  buildInventory(parseCliArgs(process.argv.slice(2)))
    .then((inventory) => {
      console.log(
        JSON.stringify(
          {
            inventory: path.resolve(
              parseCliArgs(process.argv.slice(2)).outputRoot ??
                path.join(
                  PROJECT_ROOT,
                  "outputs",
                  "catalog-images",
                  "catalog-style-v1",
                  "inventory",
                ),
              "inventory.json",
            ),
            summary: inventory.summary,
          },
          null,
          2,
        ),
      );
    })
    .catch((error) => {
      console.error(error?.stack ?? error);
      process.exitCode = 1;
    });
}
