import {
  BUCKET,
  CONTENT_TYPE,
  ContractError,
  EXPECTED_DIMENSION,
  MAX_UPLOAD_BYTES,
  constantTimeSecretEqual,
  inspectExpectedBytes,
  mapWithConcurrency,
  sha256Hex,
  validateImageSpec,
  validatePreflightRequest,
  validateRuntimeConfig,
} from "./core.mjs";

const MAX_PREFLIGHT_BODY_BYTES = 512 * 1024;
const MAX_MULTIPART_OVERHEAD_BYTES = 256 * 1024;
const PREFLIGHT_CONCURRENCY = 12;

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

function numericContentLength(request) {
  const raw = request.headers.get("content-length");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function readJsonLimited(request) {
  const declaredLength = numericContentLength(request);
  if (declaredLength !== null && declaredLength > MAX_PREFLIGHT_BODY_BYTES) {
    throw new ContractError(413, "payload_too_large");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ContractError(400, "invalid_json");
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_PREFLIGHT_BODY_BYTES) {
      await reader.cancel();
      throw new ContractError(413, "payload_too_large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new ContractError(400, "invalid_json");
  }
}

function publicUrl(storage, storagePath) {
  const value = storage.publicUrl(storagePath);
  if (typeof value !== "string" || !value) {
    throw new ContractError(502, "storage_error");
  }
  return value;
}

async function inspectExisting(storage, spec) {
  const bytes = await storage.inspect(spec.path);
  if (bytes === null) return { exists: false, matches: false };
  const comparison = await inspectExpectedBytes(bytes, spec);
  return { exists: true, ...comparison };
}

async function handlePreflight(request, config, createStorage) {
  const raw = await readJsonLimited(request);
  const items = validatePreflightRequest(raw, config);
  const storage = createStorage();
  const results = await mapWithConcurrency(items, PREFLIGHT_CONCURRENCY, async (item) => {
    const existing = await inspectExisting(storage, item);
    if (existing.exists && !existing.matches) {
      throw new ContractError(409, "object_conflict");
    }
    return {
      path: item.path,
      status: existing.exists ? "matching" : "absent",
      ...(existing.exists ? { sha256: existing.sha256 } : {}),
      public_url: publicUrl(storage, item.path),
    };
  });
  return json({
    ok: true,
    action: "preflight",
    bucket: BUCKET,
    items: results,
  });
}

function formString(form, field) {
  const value = form.get(field);
  return typeof value === "string" ? value : null;
}

function parseIntegerField(form, field) {
  const raw = formString(form, field);
  if (!raw || !/^[0-9]+$/u.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

async function readUpload(request, config) {
  const declaredLength = numericContentLength(request);
  if (declaredLength !== null && declaredLength > MAX_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD_BYTES) {
    throw new ContractError(413, "payload_too_large");
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    throw new ContractError(400, "invalid_multipart");
  }
  const file = form.get("file");
  const isFileLike =
    file &&
    typeof file === "object" &&
    typeof file.arrayBuffer === "function" &&
    typeof file.size === "number" &&
    typeof file.type === "string";
  if (
    formString(form, "action") !== "upload" ||
    formString(form, "bucket") !== BUCKET ||
    formString(form, "overwrite") !== "false" ||
    formString(form, "content_type") !== CONTENT_TYPE ||
    !isFileLike ||
    file.type !== CONTENT_TYPE
  ) {
    throw new ContractError(400, "invalid_multipart");
  }
  const rawSpec = {
    path: formString(form, "path"),
    sha256: formString(form, "sha256"),
    bytes: parseIntegerField(form, "bytes"),
    width: parseIntegerField(form, "width"),
    height: parseIntegerField(form, "height"),
    content_type: formString(form, "content_type"),
  };
  const spec = validateImageSpec(rawSpec, config);
  if (file.size !== spec.bytes || file.size > MAX_UPLOAD_BYTES) {
    throw new ContractError(422, "file_size_mismatch");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const comparison = await inspectExpectedBytes(bytes, spec);
  if (!comparison.matches) {
    throw new ContractError(422, "file_validation_failed");
  }
  return { spec, bytes };
}

async function handleUpload(request, config, createStorage) {
  const { spec, bytes } = await readUpload(request, config);
  const storage = createStorage();
  const before = await inspectExisting(storage, spec);
  if (before.exists) {
    if (!before.matches) throw new ContractError(409, "object_conflict");
    return json({
      ok: true,
      action: "upload",
      status: "already_present_matching",
      bucket: BUCKET,
      path: spec.path,
      sha256: spec.sha256,
      bytes: spec.bytes,
      width: spec.width,
      height: spec.height,
      public_url: publicUrl(storage, spec.path),
    });
  }

  const uploadStatus = await storage.upload(spec.path, bytes);
  if (uploadStatus !== "uploaded" && uploadStatus !== "exists") {
    throw new ContractError(502, "storage_error");
  }
  const after = await inspectExisting(storage, spec);
  if (!after.exists || !after.matches) {
    throw new ContractError(
      uploadStatus === "exists" ? 409 : 502,
      uploadStatus === "exists" ? "object_conflict" : "storage_verification_failed",
    );
  }
  return json({
    ok: true,
    action: "upload",
    status: uploadStatus === "exists" ? "already_present_matching" : "uploaded",
    bucket: BUCKET,
    path: spec.path,
    sha256: spec.sha256,
    bytes: spec.bytes,
    width: EXPECTED_DIMENSION,
    height: EXPECTED_DIMENSION,
    public_url: publicUrl(storage, spec.path),
  });
}

export function createCatalogImageUploadHandler({ getConfig, createStorage }) {
  return async function catalogImageUpload(request) {
    try {
      const config = validateRuntimeConfig(getConfig());
      if (!config.enabled) return json({ ok: false, error: "gone" }, 410);
      const authorized = await constantTimeSecretEqual(
        request.headers.get("x-catalog-upload-token") ?? "",
        config.token,
      );
      if (!authorized) return json({ ok: false, error: "unauthorized" }, 401);
      if (request.method !== "POST") {
        return json({ ok: false, error: "method_not_allowed" }, 405);
      }

      const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType.startsWith("application/json")) {
        return await handlePreflight(request, config, createStorage);
      }
      if (contentType.startsWith("multipart/form-data")) {
        return await handleUpload(request, config, createStorage);
      }
      throw new ContractError(415, "unsupported_media_type");
    } catch (error) {
      if (error instanceof ContractError) {
        return json({ ok: false, error: error.code }, error.status);
      }
      return json({ ok: false, error: "internal_error" }, 500);
    }
  };
}

export async function uploadBytesMatchDeclared(bytes, declaredSha256) {
  return (await sha256Hex(bytes)) === declaredSha256;
}
