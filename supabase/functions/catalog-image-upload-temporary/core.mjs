export const BUCKET = "storefront-products";
export const CONTENT_TYPE = "image/webp";
export const EXPECTED_DIMENSION = 1600;
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
export const MAX_PREFLIGHT_ITEMS = 250;

const SAFE_SEGMENT = /^[a-z0-9][a-z0-9._-]{0,80}$/u;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SHA256 = /^[a-f0-9]{64}$/u;

export class ContractError extends Error {
  constructor(status, code) {
    super(code);
    this.name = "ContractError";
    this.status = status;
    this.code = code;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function readUint24LittleEndian(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32LittleEndian(bytes, offset) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

export async function sha256Hex(bytes) {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function secretDigest(value) {
  return new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value))),
  );
}

export async function constantTimeSecretEqual(received, expected) {
  const [left, right] = await Promise.all([secretDigest(received ?? ""), secretDigest(expected)]);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export function inspectWebp(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 30 || bytes.length > MAX_UPLOAD_BYTES) {
    throw new ContractError(422, "invalid_webp");
  }
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    throw new ContractError(422, "invalid_webp");
  }
  const declaredLength = readUint32LittleEndian(bytes, 4) + 8;
  if (declaredLength !== bytes.length) {
    throw new ContractError(422, "invalid_webp");
  }

  const chunk = ascii(bytes, 12, 4);
  const chunkLength = readUint32LittleEndian(bytes, 16);
  const payloadOffset = 20;
  if (payloadOffset + chunkLength > bytes.length) {
    throw new ContractError(422, "invalid_webp");
  }

  let width;
  let height;
  if (chunk === "VP8X") {
    if (chunkLength < 10 || bytes.length < 30 || (bytes[payloadOffset] & 0x02) !== 0) {
      throw new ContractError(422, "unsupported_webp");
    }
    width = readUint24LittleEndian(bytes, payloadOffset + 4) + 1;
    height = readUint24LittleEndian(bytes, payloadOffset + 7) + 1;
  } else if (chunk === "VP8L") {
    if (chunkLength < 5 || bytes[payloadOffset] !== 0x2f) {
      throw new ContractError(422, "invalid_webp");
    }
    const byte1 = bytes[payloadOffset + 1];
    const byte2 = bytes[payloadOffset + 2];
    const byte3 = bytes[payloadOffset + 3];
    const byte4 = bytes[payloadOffset + 4];
    width = 1 + (((byte2 & 0x3f) << 8) | byte1);
    height = 1 + (((byte4 & 0x0f) << 10) | (byte3 << 2) | ((byte2 & 0xc0) >> 6));
  } else if (chunk === "VP8 ") {
    if (
      chunkLength < 10 ||
      (bytes[payloadOffset] & 0x01) !== 0 ||
      bytes[payloadOffset + 3] !== 0x9d ||
      bytes[payloadOffset + 4] !== 0x01 ||
      bytes[payloadOffset + 5] !== 0x2a
    ) {
      throw new ContractError(422, "invalid_webp");
    }
    width = (bytes[payloadOffset + 6] | (bytes[payloadOffset + 7] << 8)) & 0x3fff;
    height = (bytes[payloadOffset + 8] | (bytes[payloadOffset + 9] << 8)) & 0x3fff;
  } else {
    throw new ContractError(422, "unsupported_webp");
  }

  if (!width || !height) {
    throw new ContractError(422, "invalid_webp");
  }
  return { format: "webp", width, height, bytes: bytes.length };
}

export function validateRuntimeConfig(raw) {
  if (raw?.enabled !== true) return { enabled: false };
  const token = typeof raw.token === "string" ? raw.token : "";
  const pipelineVersion = typeof raw.pipelineVersion === "string" ? raw.pipelineVersion : "";
  const runId = typeof raw.runId === "string" ? raw.runId : "";
  if (
    token.length < 32 ||
    token.trim() !== token ||
    !SAFE_SEGMENT.test(pipelineVersion) ||
    !SAFE_SEGMENT.test(runId)
  ) {
    throw new ContractError(503, "configuration_error");
  }
  return { enabled: true, token, pipelineVersion, runId };
}

function parseNamedKeySet(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveAdminKey(env) {
  const secretKeys = parseNamedKeySet(env.SUPABASE_SECRET_KEYS);
  const publishableKeys = parseNamedKeySet(env.SUPABASE_PUBLISHABLE_KEYS);
  const key =
    (typeof secretKeys.default === "string" && secretKeys.default) ||
    (typeof env.SUPABASE_SERVICE_ROLE_KEY === "string" && env.SUPABASE_SERVICE_ROLE_KEY) ||
    "";
  const publicCandidates = new Set(
    [publishableKeys.default, env.SUPABASE_PUBLISHABLE_KEY, env.SUPABASE_ANON_KEY].filter(
      (value) => typeof value === "string" && value,
    ),
  );
  if (key.length < 32 || key.startsWith("sb_publishable_") || publicCandidates.has(key)) {
    throw new ContractError(503, "configuration_error");
  }
  return key;
}

export function validateVersionedPath(storagePath, sha256, allowlist) {
  if (
    typeof storagePath !== "string" ||
    storagePath.length > 512 ||
    storagePath.startsWith("/") ||
    storagePath.includes("\\") ||
    storagePath.includes("..") ||
    /[\u0000-\u001f\u007f]/u.test(storagePath) ||
    !SHA256.test(sha256)
  ) {
    throw new ContractError(400, "invalid_path");
  }
  const pipeline = escapeRegExp(allowlist.pipelineVersion);
  const run = escapeRegExp(allowlist.runId);
  const hashPrefix = sha256.slice(0, 12);
  const pattern = new RegExp(
    `^${UUID}/normalized/${pipeline}/${run}/[a-z0-9][a-z0-9._-]{1,180}-${hashPrefix}\\.webp$`,
    "u",
  );
  if (!pattern.test(storagePath)) {
    throw new ContractError(400, "path_not_allowed");
  }
  return storagePath;
}

export function validateImageSpec(raw, allowlist) {
  if (!isPlainObject(raw)) {
    throw new ContractError(400, "invalid_item");
  }
  if (
    raw.content_type !== CONTENT_TYPE ||
    !Number.isSafeInteger(raw.bytes) ||
    raw.bytes <= 0 ||
    raw.bytes > MAX_UPLOAD_BYTES ||
    raw.width !== EXPECTED_DIMENSION ||
    raw.height !== EXPECTED_DIMENSION ||
    typeof raw.sha256 !== "string" ||
    !SHA256.test(raw.sha256)
  ) {
    throw new ContractError(400, "invalid_item");
  }
  return {
    path: validateVersionedPath(raw.path, raw.sha256, allowlist),
    sha256: raw.sha256,
    bytes: raw.bytes,
    width: raw.width,
    height: raw.height,
    content_type: raw.content_type,
  };
}

export function validatePreflightRequest(raw, allowlist) {
  if (
    !isPlainObject(raw) ||
    raw.action !== "preflight" ||
    raw.bucket !== BUCKET ||
    raw.overwrite !== false ||
    !Array.isArray(raw.items) ||
    raw.items.length === 0 ||
    raw.items.length > MAX_PREFLIGHT_ITEMS
  ) {
    throw new ContractError(400, "invalid_preflight");
  }
  const items = raw.items.map((item) => validateImageSpec(item, allowlist));
  const paths = new Set();
  for (const item of items) {
    if (paths.has(item.path)) {
      throw new ContractError(400, "duplicate_path");
    }
    paths.add(item.path);
  }
  return items;
}

export async function inspectExpectedBytes(bytes, spec) {
  let inspected;
  try {
    inspected = inspectWebp(bytes);
  } catch (error) {
    if (error instanceof ContractError) {
      return { matches: false, sha256: null, inspected: null };
    }
    throw error;
  }
  const actualSha256 = await sha256Hex(bytes);
  return {
    matches:
      actualSha256 === spec.sha256 &&
      inspected.bytes === spec.bytes &&
      inspected.width === spec.width &&
      inspected.height === spec.height,
    sha256: actualSha256,
    inspected,
  };
}

export async function mapWithConcurrency(values, concurrency, operation) {
  const results = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await operation(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
