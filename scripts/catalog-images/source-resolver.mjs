import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PROJECT_ROOT } from "./env.mjs";

const REVIEWED_REPORT = path.join(
  "reports",
  "product-image-import",
  "2026-07-20-reviewed-dry-run",
  "product-image-dry-run.json",
);
const REVIEWED_ROLLBACK = path.join(
  "reports",
  "product-image-import",
  "2026-07-20-apply",
  "rollback.json",
);
const SKU_APPLY_REPORT = path.join(
  "reports",
  "product-image-import",
  "2026-07-21-sku-apply",
  "sku-image-apply.json",
);
const LATE_UPLOAD_MANIFEST = path.join(
  "reports",
  "product-image-import",
  "fotos-faltantes-upload-20260727",
  "storage-upload-manifest.json",
);

function normalizeStoragePath(value) {
  return String(value ?? "")
    .replace(/\\/gu, "/")
    .replace(/^\/+/u, "");
}

async function readJson(filename, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filename, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw new Error(`No se pudo leer ${filename}: ${error.message}`, { cause: error });
  }
}

async function isFile(filename) {
  if (!filename) return false;
  try {
    return (await fs.stat(filename)).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function listApplyExtractionRoots(projectRoot) {
  const root = path.join(projectRoot, "tmp", "product-image-import");
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("apply-"))
      .map((entry) => path.join(root, entry.name, "extracted"))
      .sort((left, right) => right.localeCompare(left, "en"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function addCandidate(candidateMap, storagePath, candidate) {
  const normalized = normalizeStoragePath(storagePath);
  if (!normalized || !candidate?.localPath) return;
  const group = candidateMap.get(normalized) ?? [];
  const canonicalPath = path.resolve(candidate.localPath);
  if (!group.some((entry) => path.resolve(entry.localPath) === canonicalPath)) {
    group.push({ ...candidate, localPath: canonicalPath });
    candidateMap.set(normalized, group);
  }
}

function addLedgerMetadata(metadataMap, storagePath, metadata) {
  const normalized = normalizeStoragePath(storagePath);
  if (!normalized) return;
  metadataMap.set(normalized, {
    ...(metadataMap.get(normalized) ?? {}),
    ...Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null),
    ),
  });
}

async function sha256File(filename) {
  const hash = createHash("sha256");
  const handle = await fs.open(filename, "r");
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk);
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

function orientedDimensions(metadata) {
  const orientation = Number(metadata.orientation ?? 1);
  if ([5, 6, 7, 8].includes(orientation)) {
    return { width: metadata.height ?? null, height: metadata.width ?? null };
  }
  return { width: metadata.width ?? null, height: metadata.height ?? null };
}

export async function inspectLocalImage(filename) {
  const [metadata, stat, sha256] = await Promise.all([
    sharp(filename, { failOn: "warning" }).metadata(),
    fs.stat(filename),
    sha256File(filename),
  ]);
  const dimensions = orientedDimensions(metadata);
  return {
    local_path: path.resolve(filename),
    sha256,
    width: dimensions.width,
    height: dimensions.height,
    bytes: stat.size,
    mime: mimeFromFormat(metadata.format),
  };
}

export function mimeFromFormat(format) {
  const normalized = String(format ?? "").toLowerCase();
  if (normalized === "jpg" || normalized === "jpeg") return "image/jpeg";
  if (normalized === "png") return "image/png";
  if (normalized === "webp") return "image/webp";
  if (normalized === "avif") return "image/avif";
  if (normalized === "heif" || normalized === "heic") return "image/heic";
  if (normalized === "tiff") return "image/tiff";
  if (normalized === "gif") return "image/gif";
  return normalized ? `image/${normalized}` : null;
}

export async function chooseHighestResolutionCandidate(candidates, inspect = inspectLocalImage) {
  const inspected = [];
  for (const candidate of candidates ?? []) {
    if (!(await isFile(candidate.localPath))) continue;
    try {
      inspected.push({
        ...candidate,
        ...(await inspect(candidate.localPath)),
      });
    } catch (error) {
      inspected.push({
        ...candidate,
        invalid: true,
        inspection_error: String(error?.message ?? error),
      });
    }
  }

  const valid = inspected
    .filter((candidate) => !candidate.invalid)
    .sort((left, right) => {
      const leftPixels = Number(left.width ?? 0) * Number(left.height ?? 0);
      const rightPixels = Number(right.width ?? 0) * Number(right.height ?? 0);
      return (
        rightPixels - leftPixels ||
        Number(right.priority ?? 0) - Number(left.priority ?? 0) ||
        Number(right.bytes ?? 0) - Number(left.bytes ?? 0) ||
        left.local_path.localeCompare(right.local_path, "en")
      );
    });

  return {
    selected: valid[0] ?? null,
    inspected,
  };
}

async function loadReviewedSources(projectRoot, candidateMap, metadataMap) {
  const [report, rollback, extractionRoots] = await Promise.all([
    readJson(path.join(projectRoot, REVIEWED_REPORT), { all_rows: [] }),
    readJson(path.join(projectRoot, REVIEWED_ROLLBACK), { changes: [] }),
    listApplyExtractionRoots(projectRoot),
  ]);

  for (const change of rollback?.changes ?? []) {
    addLedgerMetadata(metadataMap, change.storage_path, {
      image_id: change.image_id,
      is_primary: change.is_primary,
      product_id: change.product_id,
      provenance: "2026-07-20-apply:rollback",
    });
  }

  for (const row of report?.all_rows ?? []) {
    if (
      row.status !== "proposed" ||
      !row.product_id ||
      !row.proposed_filename ||
      !row.source_image
    ) {
      continue;
    }
    const storagePath = `${row.product_id}/${row.proposed_filename}`;
    for (const extractionRoot of extractionRoots) {
      addCandidate(candidateMap, storagePath, {
        localPath: path.join(extractionRoot, ...String(row.source_image).split("/")),
        provenance: "2026-07-20-reviewed-dry-run:source_image",
        resolutionStatus: "resolved_original_from_reviewed_dry_run",
      });
    }
  }
}

async function loadSkuApplySources(projectRoot, candidateMap, metadataMap) {
  const report = await readJson(path.join(projectRoot, SKU_APPLY_REPORT), {
    summary: {},
    applied: [],
  });
  const inputRoot = report?.summary?.input ? path.resolve(report.summary.input) : null;
  for (const row of report?.applied ?? []) {
    addLedgerMetadata(metadataMap, row.storage_path, {
      image_id: row.image_id,
      is_primary: row.is_primary,
      product_id: row.product_id,
      provenance: "2026-07-21-sku-apply",
    });
    if (inputRoot && row.source_image) {
      addCandidate(candidateMap, row.storage_path, {
        localPath: path.join(inputRoot, ...String(row.source_image).split("/")),
        provenance: "2026-07-21-sku-apply:source_image",
        resolutionStatus: "resolved_original_from_sku_apply",
      });
    }
  }
}

async function loadLateUploadSources(projectRoot, candidateMap, metadataMap) {
  const manifest = await readJson(path.join(projectRoot, LATE_UPLOAD_MANIFEST), []);
  const preparedRoots = [
    {
      root: path.join(projectRoot, "tmp", "fotos-faltantes-prepared-v2-20260727"),
      priority: 20,
    },
    {
      root: path.join(projectRoot, "tmp", "fotos-faltantes-prepared-20260727"),
      priority: 10,
    },
  ];

  for (const row of manifest ?? []) {
    addLedgerMetadata(metadataMap, row.storage_path, {
      is_primary: true,
      product_id: row.product_id,
      provenance: "fotos-faltantes-upload-20260727:manifest",
      content_hash: row.content_hash,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
    });
    for (const preparedRoot of preparedRoots) {
      addCandidate(candidateMap, row.storage_path, {
        localPath: path.join(preparedRoot.root, String(row.source_image ?? "")),
        provenance: "fotos-faltantes-upload-20260727:prepared-source",
        resolutionStatus: "resolved_prepared_source_from_upload_manifest",
        priority: preparedRoot.priority,
      });
    }
    if (row.local_path) {
      addCandidate(candidateMap, row.storage_path, {
        localPath: row.local_path,
        provenance: "fotos-faltantes-upload-20260727:optimized-asset-fallback",
        resolutionStatus: "resolved_optimized_upload_asset_only",
        priority: 0,
      });
    }
  }
}

export async function createSourceResolver({ projectRoot = PROJECT_ROOT } = {}) {
  const candidatesByStoragePath = new Map();
  const ledgerMetadataByStoragePath = new Map();

  await Promise.all([
    loadReviewedSources(projectRoot, candidatesByStoragePath, ledgerMetadataByStoragePath),
    loadSkuApplySources(projectRoot, candidatesByStoragePath, ledgerMetadataByStoragePath),
    loadLateUploadSources(projectRoot, candidatesByStoragePath, ledgerMetadataByStoragePath),
  ]);

  const sourceCache = new Map();
  return {
    candidateCount: [...candidatesByStoragePath.values()].reduce(
      (total, candidates) => total + candidates.length,
      0,
    ),
    storagePathCount: candidatesByStoragePath.size,
    ledgerMetadata(storagePath) {
      return ledgerMetadataByStoragePath.get(normalizeStoragePath(storagePath)) ?? null;
    },
    async resolve(storagePath) {
      const normalized = normalizeStoragePath(storagePath);
      if (sourceCache.has(normalized)) return sourceCache.get(normalized);
      const candidates = candidatesByStoragePath.get(normalized) ?? [];
      const { selected } = await chooseHighestResolutionCandidate(candidates);
      const result = selected
        ? {
            local_path: selected.local_path,
            sha256: selected.sha256,
            width: selected.width,
            height: selected.height,
            bytes: selected.bytes,
            provenance: selected.provenance,
            resolution_status: selected.resolutionStatus,
          }
        : null;
      sourceCache.set(normalized, result);
      return result;
    },
  };
}
