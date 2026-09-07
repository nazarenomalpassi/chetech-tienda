import { createHash, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { buildUploadPlan, validateManifestLocalOutputs, verifyApproval } from "./storage.mjs";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const EXPECTED_BUCKET = "storefront-products";
const LEDGER_SCHEMA_VERSION = 1;
const SAFE_RESPONSE_STATUSES = new Set(["absent", "matching"]);
const SAFE_UPLOAD_STATUSES = new Set(["uploaded", "already_present_matching"]);
const MAX_STANDARD_UPLOAD_BYTES = 6 * 1024 * 1024;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fileSha256(filename) {
  return sha256(await fs.readFile(filename));
}

function nowIso() {
  return new Date().toISOString();
}

function safeError(error) {
  if (error instanceof EdgeUploadError) return error.message;
  return "La operaci\u00f3n HTTP no pudo completarse.";
}

export class EdgeUploadError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "EdgeUploadError";
  }
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(filename, "utf8"));
}

async function writeJsonAtomic(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await fs.rename(temporary, filename);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function readEdgeUploadEnvironment(env = process.env) {
  const rawUrl = String(env.CATALOG_EDGE_FUNCTION_URL ?? "").trim();
  const token = String(env.CATALOG_EDGE_UPLOAD_TOKEN ?? "");
  if (!rawUrl) {
    throw new EdgeUploadError("Falta CATALOG_EDGE_FUNCTION_URL en el entorno.");
  }
  if (token.length < 32 || token.trim() !== token) {
    throw new EdgeUploadError(
      "CATALOG_EDGE_UPLOAD_TOKEN debe ser un secreto temporal de al menos 32 caracteres.",
    );
  }
  let functionUrl;
  try {
    functionUrl = new URL(rawUrl);
  } catch {
    throw new EdgeUploadError("CATALOG_EDGE_FUNCTION_URL no es una URL v\u00e1lida.");
  }
  if (
    functionUrl.username ||
    functionUrl.password ||
    functionUrl.search ||
    functionUrl.hash ||
    (functionUrl.protocol !== "https:" &&
      !(functionUrl.protocol === "http:" && isLoopback(functionUrl.hostname)))
  ) {
    throw new EdgeUploadError(
      "CATALOG_EDGE_FUNCTION_URL debe ser HTTPS, sin credenciales, query ni fragmento.",
    );
  }
  return { functionUrl: functionUrl.toString(), token };
}

function assertVersionedPath(item, manifest) {
  const storagePath = String(item.target_storage_path ?? "");
  const parts = storagePath.split("/");
  if (
    storagePath.startsWith("/") ||
    storagePath.includes("\\") ||
    storagePath.includes("..") ||
    /[\u0000-\u001f\u007f]/u.test(storagePath) ||
    parts.length !== 5
  ) {
    throw new EdgeUploadError(`Ruta de Storage no segura para ${item.sku}.`);
  }
  const [productId, normalized, pipelineVersion, runId, filename] = parts;
  if (
    productId !== item.product_id ||
    normalized !== "normalized" ||
    !pipelineVersion ||
    !runId ||
    !filename.endsWith(`-${item.output_hash.slice(0, 12)}.webp`) ||
    !/^[a-z0-9._-]+$/u.test(pipelineVersion) ||
    !/^[a-z0-9._-]+$/u.test(runId) ||
    !/^[a-z0-9._-]+\.webp$/u.test(filename)
  ) {
    throw new EdgeUploadError(
      `La ruta de ${item.sku} no es una versi\u00f3n inmutable v\u00e1lida.`,
    );
  }
  if (
    !storagePath.includes(`/${String(manifest.pipeline_version).toLowerCase()}/`) ||
    !storagePath.includes(`/${String(manifest.run_id).toLowerCase()}/`)
  ) {
    throw new EdgeUploadError(`La ruta de ${item.sku} no corresponde al lote aprobado.`);
  }
}

function validatePlan(plan, manifest) {
  if (!Array.isArray(plan) || !plan.length) {
    throw new EdgeUploadError("El lote aprobado no contiene archivos para subir.");
  }
  const paths = new Set();
  for (const item of plan) {
    assertVersionedPath(item, manifest);
    if (
      item.output_width !== 1600 ||
      item.output_height !== 1600 ||
      item.output_hash.length !== 64 ||
      item.output_bytes <= 0 ||
      item.output_bytes > MAX_STANDARD_UPLOAD_BYTES
    ) {
      throw new EdgeUploadError(`La salida aprobada de ${item.sku} no cumple 1600x1600 WebP.`);
    }
    if (paths.has(item.target_storage_path)) {
      throw new EdgeUploadError(`Ruta de destino duplicada: ${item.target_storage_path}.`);
    }
    paths.add(item.target_storage_path);
  }
}

function publicUrlMatchesPath(publicUrl, storagePath, functionUrl, bucket = EXPECTED_BUCKET) {
  try {
    const url = new URL(publicUrl);
    const edgeUrl = new URL(functionUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) {
      return false;
    }
    if (url.username || url.password || url.hash || url.hostname !== edgeUrl.hostname) {
      return false;
    }
    const decodedPath = decodeURIComponent(url.pathname);
    return (
      decodedPath.includes(`/storage/v1/object/public/${bucket}/`) &&
      decodedPath.endsWith(`/${storagePath}`)
    );
  } catch {
    return false;
  }
}

function headersFor(token) {
  return {
    accept: "application/json",
    "x-catalog-upload-token": token,
  };
}

function retryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function requestJsonWithRetry(label, requestFactory, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await requestFactory();
      if (!response.ok) {
        const error = new EdgeUploadError(`${label} devolvi\u00f3 HTTP ${response.status}.`);
        if (!retryableStatus(response.status) || attempt === attempts) throw error;
        lastError = error;
      } else {
        let payload;
        try {
          payload = await response.json();
        } catch {
          throw new EdgeUploadError(`${label} devolvi\u00f3 JSON inv\u00e1lido.`);
        }
        return payload;
      }
    } catch (error) {
      lastError =
        error instanceof EdgeUploadError
          ? error
          : new EdgeUploadError(`${label} fall\u00f3 por un error de red.`);
      if (attempt === attempts || error instanceof EdgeUploadError) {
        if (!(error instanceof EdgeUploadError && retryableStatusFromMessage(error.message))) {
          throw lastError;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 150));
  }
  throw lastError;
}

function retryableStatusFromMessage(message) {
  const match = String(message).match(/HTTP (\d{3})/u);
  return match ? retryableStatus(Number(match[1])) : false;
}

function validatePreflightPayload(payload, plan, functionUrl) {
  if (
    payload?.ok !== true ||
    payload?.action !== "preflight" ||
    payload?.bucket !== EXPECTED_BUCKET ||
    !Array.isArray(payload.items) ||
    payload.items.length !== plan.length
  ) {
    throw new EdgeUploadError("La respuesta de preflight no cumple el contrato esperado.");
  }
  const expected = new Map(plan.map((item) => [item.target_storage_path, item]));
  const results = new Map();
  for (const result of payload.items) {
    const planned = expected.get(result?.path);
    if (
      !planned ||
      results.has(result.path) ||
      !SAFE_RESPONSE_STATUSES.has(result.status) ||
      !publicUrlMatchesPath(result.public_url, result.path, functionUrl)
    ) {
      throw new EdgeUploadError("El preflight devolvi\u00f3 un objeto inesperado o inseguro.");
    }
    if (result.status === "matching" && result.sha256 !== planned.output_hash) {
      throw new EdgeUploadError(`El objeto existente de ${planned.sku} tiene otro hash.`);
    }
    results.set(result.path, result);
  }
  if (results.size !== plan.length) {
    throw new EdgeUploadError("El preflight no cubri\u00f3 exactamente todo el plan.");
  }
  return results;
}

export async function remotePreflight({ functionUrl, token, plan, fetchImpl = fetch }) {
  const payload = await requestJsonWithRetry("El preflight remoto", () =>
    fetchImpl(functionUrl, {
      method: "POST",
      headers: {
        ...headersFor(token),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "preflight",
        bucket: EXPECTED_BUCKET,
        overwrite: false,
        items: plan.map((item) => ({
          path: item.target_storage_path,
          sha256: item.output_hash,
          bytes: item.output_bytes,
          width: item.output_width,
          height: item.output_height,
          content_type: "image/webp",
        })),
      }),
    }),
  );
  return validatePreflightPayload(payload, plan, functionUrl);
}

function buildDatabaseTransaction(item, manifestItem, publicUrl) {
  return {
    image_locator: item.image_id
      ? { type: "id", id: item.image_id }
      : { type: "storage_path", storage_path: item.source_storage_path },
    expected_image: {
      product_id: item.product_id,
      storage_path: item.source_storage_path,
      public_url: manifestItem.source.production_url ?? null,
      is_primary: Boolean(manifestItem.is_primary),
      sort_order: Number(manifestItem.position ?? 0),
    },
    replacement_image: {
      storage_path: item.target_storage_path,
      public_url: publicUrl,
      content_hash: item.output_hash,
      width: item.output_width,
      height: item.output_height,
    },
    product_primary: manifestItem.is_primary
      ? {
          product_id: item.product_id,
          expected_public_url: manifestItem.source.production_url ?? null,
          replacement_public_url: publicUrl,
        }
      : null,
  };
}

function planFingerprint(plan) {
  return sha256(
    JSON.stringify(
      plan.map((item) => ({
        review_id: item.review_id,
        path: item.target_storage_path,
        sha256: item.output_hash,
        bytes: item.output_bytes,
      })),
    ),
  );
}

function buildLedger({ context, plan, preflight, functionUrl, ledgerPath }) {
  const manifestItems = new Map(context.manifest.items.map((item) => [item.id, item]));
  const createdAt = nowIso();
  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    kind: "catalog-edge-storage-upload",
    status: "ready",
    storage_only: true,
    database_modified: false,
    bucket: EXPECTED_BUCKET,
    run_id: context.manifest.run_id,
    pipeline_version: context.manifest.pipeline_version,
    manifest: {
      path: context.manifestPath,
      sha256: context.manifestHash,
    },
    approval: {
      path: context.approvalPath,
      sha256: context.approvalHash,
      reviewed_by: context.approval.reviewed_by,
      reviewed_at: context.approval.reviewed_at,
    },
    function_url_sha256: sha256(functionUrl),
    plan_sha256: planFingerprint(plan),
    ledger_path: ledgerPath,
    created_at: createdAt,
    updated_at: createdAt,
    completed_at: null,
    counts: {
      planned: plan.length,
      verified: 0,
      pending: plan.length,
    },
    items: plan.map((item) => {
      const remote = preflight.get(item.target_storage_path);
      const manifestItem = manifestItems.get(item.review_id);
      return {
        review_id: item.review_id,
        image_id: item.image_id,
        product_id: item.product_id,
        sku: item.sku,
        local: {
          path: item.output_path,
          sha256: item.output_hash,
          bytes: item.output_bytes,
          width: item.output_width,
          height: item.output_height,
          content_type: "image/webp",
        },
        target: {
          bucket: EXPECTED_BUCKET,
          storage_path: item.target_storage_path,
          public_url: remote.public_url,
          overwrite: false,
        },
        database_transaction: buildDatabaseTransaction(item, manifestItem, remote.public_url),
        remote_preflight: {
          status: remote.status,
          checked_at: createdAt,
        },
        stage: "pending",
        last_error: null,
        history: [{ at: createdAt, stage: "pending" }],
      };
    }),
  };
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function validateExistingLedger(ledger, { context, plan, functionUrl }) {
  if (
    ledger?.schema_version !== LEDGER_SCHEMA_VERSION ||
    ledger?.kind !== "catalog-edge-storage-upload" ||
    ledger?.storage_only !== true ||
    ledger?.database_modified !== false ||
    !safeEqual(ledger?.manifest?.sha256, context.manifestHash) ||
    !safeEqual(ledger?.approval?.sha256, context.approvalHash) ||
    !safeEqual(ledger?.function_url_sha256, sha256(functionUrl)) ||
    !safeEqual(ledger?.plan_sha256, planFingerprint(plan)) ||
    !Array.isArray(ledger?.items) ||
    ledger.items.length !== plan.length
  ) {
    throw new EdgeUploadError("El ledger existente no corresponde exactamente a este lote.");
  }
  const plannedPaths = new Set(plan.map((item) => item.target_storage_path));
  for (const item of ledger.items) {
    if (
      !plannedPaths.has(item?.target?.storage_path) ||
      !["pending", "uploaded_unverified", "verified"].includes(item.stage)
    ) {
      throw new EdgeUploadError("El ledger existente contiene una etapa o ruta inv\u00e1lida.");
    }
  }
}

function ledgerItemContract(item) {
  return {
    review_id: item.review_id,
    image_id: item.image_id,
    product_id: item.product_id,
    sku: item.sku,
    local: item.local,
    target: item.target,
    database_transaction: item.database_transaction,
  };
}

function validateLedgerItemsAgainstPreflight({
  ledger,
  context,
  plan,
  preflight,
  functionUrl,
  ledgerPath,
}) {
  const expected = buildLedger({
    context,
    plan,
    preflight,
    functionUrl,
    ledgerPath,
  });
  for (let index = 0; index < expected.items.length; index += 1) {
    const expectedHash = sha256(JSON.stringify(ledgerItemContract(expected.items[index])));
    const actualHash = sha256(JSON.stringify(ledgerItemContract(ledger.items[index])));
    if (!safeEqual(actualHash, expectedHash)) {
      throw new EdgeUploadError(
        "El ledger existente fue modificado o ya no coincide con el plan aprobado.",
      );
    }
  }
}

async function buildContext(manifestPath, approvalPath) {
  const resolvedManifest = path.resolve(manifestPath);
  const resolvedApproval = path.resolve(approvalPath);
  const verified = await verifyApproval(resolvedManifest, resolvedApproval);
  await validateManifestLocalOutputs(verified.manifest);
  const plan = await buildUploadPlan(verified.manifest, verified.approvedItems);
  validatePlan(plan, verified.manifest);
  return {
    ...verified,
    plan,
    manifestPath: resolvedManifest,
    approvalPath: resolvedApproval,
    manifestHash: await fileSha256(resolvedManifest),
    approvalHash: await fileSha256(resolvedApproval),
  };
}

function validateUploadPayload(payload, ledgerItem) {
  if (
    payload?.ok !== true ||
    payload?.action !== "upload" ||
    !SAFE_UPLOAD_STATUSES.has(payload?.status) ||
    payload?.bucket !== EXPECTED_BUCKET ||
    payload?.path !== ledgerItem.target.storage_path ||
    payload?.sha256 !== ledgerItem.local.sha256 ||
    Number(payload?.bytes) !== ledgerItem.local.bytes ||
    Number(payload?.width) !== 1600 ||
    Number(payload?.height) !== 1600 ||
    payload?.public_url !== ledgerItem.target.public_url
  ) {
    throw new EdgeUploadError(`La confirmaci\u00f3n remota de ${ledgerItem.sku} es inv\u00e1lida.`);
  }
}

async function uploadOne({ functionUrl, token, item, fetchImpl }) {
  const buffer = await fs.readFile(item.local.path);
  const payload = await requestJsonWithRetry(`La subida de ${item.sku}`, () => {
    const form = new FormData();
    form.set("action", "upload");
    form.set("bucket", EXPECTED_BUCKET);
    form.set("path", item.target.storage_path);
    form.set("sha256", item.local.sha256);
    form.set("bytes", String(item.local.bytes));
    form.set("width", String(item.local.width));
    form.set("height", String(item.local.height));
    form.set("content_type", "image/webp");
    form.set("overwrite", "false");
    form.set("file", new Blob([buffer], { type: "image/webp" }), path.basename(item.local.path));
    return fetchImpl(functionUrl, {
      method: "POST",
      headers: headersFor(token),
      body: form,
    });
  });
  validateUploadPayload(payload, item);
}

async function inspectPublicWebp(publicUrl, expected, fetchImpl) {
  const verificationUrl = new URL(publicUrl);
  verificationUrl.searchParams.set("catalog_verify", expected.sha256.slice(0, 16));
  const response = await requestResponseWithRetry(
    `La verificaci\u00f3n p\u00fablica de ${expected.sku}`,
    () =>
      fetchImpl(verificationUrl, {
        method: "GET",
        headers: {
          accept: "image/webp",
          "cache-control": "no-cache",
        },
        redirect: "error",
      }),
  );
  const buffer = Buffer.from(await response.arrayBuffer());
  let metadata;
  try {
    metadata = await sharp(buffer, { failOn: "warning" }).metadata();
  } catch {
    throw new EdgeUploadError(
      `El objeto p\u00fablico de ${expected.sku} no es una imagen v\u00e1lida.`,
    );
  }
  if (
    sha256(buffer) !== expected.sha256 ||
    buffer.length !== expected.bytes ||
    metadata.format !== "webp" ||
    metadata.width !== 1600 ||
    metadata.height !== 1600
  ) {
    throw new EdgeUploadError(
      `El objeto p\u00fablico de ${expected.sku} no coincide con el WebP aprobado.`,
    );
  }
}

async function requestResponseWithRetry(label, requestFactory, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await requestFactory();
      if (response.ok) return response;
      lastError = new EdgeUploadError(`${label} devolvi\u00f3 HTTP ${response.status}.`);
      if (!retryableStatus(response.status)) throw lastError;
    } catch (error) {
      lastError =
        error instanceof EdgeUploadError
          ? error
          : new EdgeUploadError(`${label} fall\u00f3 por un error de red.`);
      if (error instanceof EdgeUploadError && !retryableStatusFromMessage(error.message)) {
        throw lastError;
      }
    }
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
  }
  throw lastError;
}

async function persistItemStage(ledgerPath, ledger, item, stage, extra = {}) {
  item.stage = stage;
  item.last_error = null;
  Object.assign(item, extra);
  item.history.push({ at: nowIso(), stage });
  ledger.updated_at = nowIso();
  ledger.status = "uploading";
  ledger.counts.verified = ledger.items.filter((entry) => entry.stage === "verified").length;
  ledger.counts.pending = ledger.items.length - ledger.counts.verified;
  await writeJsonAtomic(ledgerPath, ledger);
}

export async function uploadApprovedViaEdge({
  manifestPath,
  approvalPath,
  ledgerPath,
  env = process.env,
  fetchImpl = fetch,
  preflightOnly = false,
}) {
  if (!manifestPath || !approvalPath) {
    throw new EdgeUploadError("Se requieren --manifest y --approval.");
  }
  const environment = readEdgeUploadEnvironment(env);
  let context;
  try {
    context = await buildContext(manifestPath, approvalPath);
  } catch (error) {
    throw new EdgeUploadError(
      `La validaci\u00f3n local del lote fall\u00f3: ${String(error?.message ?? error)}`,
    );
  }
  const resolvedLedger = path.resolve(
    ledgerPath ?? path.join(path.dirname(context.manifestPath), "edge-upload-ledger.json"),
  );
  let ledger = null;
  try {
    ledger = await readJson(resolvedLedger);
    validateExistingLedger(ledger, {
      context,
      plan: context.plan,
      functionUrl: environment.functionUrl,
    });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const preflight = await remotePreflight({
    ...environment,
    plan: context.plan,
    fetchImpl,
  });
  if (preflightOnly) {
    return {
      mode: "preflight-only",
      storage_modified: false,
      database_modified: false,
      planned: context.plan.length,
      ledger: ledger ? resolvedLedger : null,
    };
  }

  if (!ledger) {
    ledger = buildLedger({
      context,
      plan: context.plan,
      preflight,
      functionUrl: environment.functionUrl,
      ledgerPath: resolvedLedger,
    });
    await writeJsonAtomic(resolvedLedger, ledger);
  } else {
    validateLedgerItemsAgainstPreflight({
      ledger,
      context,
      plan: context.plan,
      preflight,
      functionUrl: environment.functionUrl,
      ledgerPath: resolvedLedger,
    });
    for (const item of ledger.items) {
      const remote = preflight.get(item.target.storage_path);
      if (remote.public_url !== item.target.public_url) {
        throw new EdgeUploadError(
          `La URL p\u00fablica de ${item.sku} cambi\u00f3 entre reanudaciones.`,
        );
      }
      item.remote_preflight = { status: remote.status, checked_at: nowIso() };
    }
    ledger.updated_at = nowIso();
    await writeJsonAtomic(resolvedLedger, ledger);
  }

  let uploadedThisRun = 0;
  for (const item of ledger.items) {
    try {
      const remote = preflight.get(item.target.storage_path);
      if (remote.status === "absent") {
        await uploadOne({
          ...environment,
          item,
          fetchImpl,
        });
        uploadedThisRun += 1;
        await persistItemStage(resolvedLedger, ledger, item, "uploaded_unverified");
      }
      await inspectPublicWebp(
        item.target.public_url,
        {
          sku: item.sku,
          sha256: item.local.sha256,
          bytes: item.local.bytes,
        },
        fetchImpl,
      );
      await persistItemStage(resolvedLedger, ledger, item, "verified", {
        verified_at: nowIso(),
      });
    } catch (error) {
      item.last_error = safeError(error);
      item.history.push({ at: nowIso(), stage: "failed", error: item.last_error });
      ledger.status = "failed";
      ledger.updated_at = nowIso();
      await writeJsonAtomic(resolvedLedger, ledger);
      throw error;
    }
  }

  ledger.status = "completed";
  ledger.completed_at = nowIso();
  ledger.updated_at = ledger.completed_at;
  ledger.counts.verified = ledger.items.length;
  ledger.counts.pending = 0;
  await writeJsonAtomic(resolvedLedger, ledger);
  return {
    mode: "storage-upload",
    storage_modified: uploadedThisRun > 0,
    database_modified: false,
    uploaded_or_reused: ledger.items.length,
    uploaded: uploadedThisRun,
    reused: ledger.items.length - uploadedThisRun,
    verified: ledger.items.length,
    ledger: resolvedLedger,
    plan_sha256: ledger.plan_sha256,
  };
}

function usage() {
  return [
    "Uso:",
    "  node scripts/catalog-images/edge-upload.mjs --manifest <manifest.json> --approval <approval.json> [--ledger <ledger.json>] [--preflight-only]",
    "",
    "Entorno requerido:",
    "  CATALOG_EDGE_FUNCTION_URL",
    "  CATALOG_EDGE_UPLOAD_TOKEN",
  ].join("\n");
}

async function main() {
  const { values } = parseArgs({
    options: {
      manifest: { type: "string" },
      approval: { type: "string" },
      ledger: { type: "string" },
      "preflight-only": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  if (values.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await uploadApprovedViaEdge({
    manifestPath: values.manifest,
    approvalPath: values.approval,
    ledgerPath: values.ledger,
    preflightOnly: values["preflight-only"],
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: result.mode,
        storage_modified: result.storage_modified,
        database_modified: false,
        planned: result.planned ?? result.verified,
        verified: result.verified ?? 0,
        ledger: result.ledger,
      },
      null,
      2,
    )}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_FILE)) {
  main().catch((error) => {
    process.stderr.write(`Error: ${safeError(error)}\n`);
    process.exitCode = 1;
  });
}
