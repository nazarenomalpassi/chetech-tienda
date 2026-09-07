import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import {
  BUCKET,
  ContractError,
  constantTimeSecretEqual,
  inspectWebp,
  resolveAdminKey,
  sha256Hex,
  validatePreflightRequest,
  validateVersionedPath,
} from "./core.mjs";
import { createCatalogImageUploadHandler } from "./handler.mjs";

const TOKEN = "temporary-handler-test-token-at-least-32-characters";
const PIPELINE = "catalog-style-v1";
const RUN_ID = "full-approved-v1";
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const PUBLIC_BASE = "https://project.supabase.co/storage/v1/object/public/storefront-products";

async function webp(width = 1600, height = 1600, lossless = false) {
  return new Uint8Array(
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: "#f4f4f2",
      },
    })
      .webp(lossless ? { lossless: true } : { quality: 90 })
      .toBuffer(),
  );
}

async function scenario() {
  const bytes = await webp();
  const hash = await sha256Hex(bytes);
  const storagePath = `${PRODUCT_ID}/normalized/${PIPELINE}/${RUN_ID}/sku-001-review000001-${hash.slice(0, 12)}.webp`;
  return {
    bytes,
    hash,
    storagePath,
    spec: {
      path: storagePath,
      sha256: hash,
      bytes: bytes.length,
      width: 1600,
      height: 1600,
      content_type: "image/webp",
    },
  };
}

class FakeStorage {
  constructor() {
    this.objects = new Map();
    this.uploadCalls = 0;
    this.inspectCalls = 0;
  }

  async inspect(storagePath) {
    this.inspectCalls += 1;
    const value = this.objects.get(storagePath);
    return value ? new Uint8Array(value) : null;
  }

  async upload(storagePath, bytes) {
    this.uploadCalls += 1;
    if (this.objects.has(storagePath)) return "exists";
    this.objects.set(storagePath, new Uint8Array(bytes));
    return "uploaded";
  }

  publicUrl(storagePath) {
    return `${PUBLIC_BASE}/${storagePath}`;
  }
}

function makeHandler(storage, overrides = {}) {
  let storageCreations = 0;
  const handler = createCatalogImageUploadHandler({
    getConfig: () => ({
      enabled: true,
      token: TOKEN,
      pipelineVersion: PIPELINE,
      runId: RUN_ID,
      ...overrides,
    }),
    createStorage: () => {
      storageCreations += 1;
      return storage;
    },
  });
  return { handler, storageCreations: () => storageCreations };
}

function authorizedHeaders(extra = {}) {
  return {
    "x-catalog-upload-token": TOKEN,
    ...extra,
  };
}

async function preflightRequest(handler, spec) {
  return handler(
    new Request("https://project.supabase.co/functions/v1/catalog-image-upload-temporary", {
      method: "POST",
      headers: authorizedHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        action: "preflight",
        bucket: BUCKET,
        overwrite: false,
        items: [spec],
      }),
    }),
  );
}

async function uploadRequest(handler, entry) {
  const form = new FormData();
  form.set("action", "upload");
  form.set("bucket", BUCKET);
  form.set("path", entry.storagePath);
  form.set("sha256", entry.hash);
  form.set("bytes", String(entry.bytes.length));
  form.set("width", "1600");
  form.set("height", "1600");
  form.set("content_type", "image/webp");
  form.set("overwrite", "false");
  form.set("file", new Blob([entry.bytes], { type: "image/webp" }), "approved.webp");
  return handler(
    new Request("https://project.supabase.co/functions/v1/catalog-image-upload-temporary", {
      method: "POST",
      headers: authorizedHeaders(),
      body: form,
    }),
  );
}

test("comparaci\u00f3n constante autentica el secreto correcto", async () => {
  assert.equal(await constantTimeSecretEqual(TOKEN, TOKEN), true);
  assert.equal(await constantTimeSecretEqual(`${TOKEN}x`, TOKEN), false);
  assert.equal(await constantTimeSecretEqual("", TOKEN), false);
});

test("prioriza SUPABASE_SECRET_KEYS.default y usa fallback legacy seguro", () => {
  assert.equal(
    resolveAdminKey({
      SUPABASE_SECRET_KEYS: JSON.stringify({
        default: "sb_secret_primary_12345678901234567890",
      }),
      SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role-12345678901234567890",
    }),
    "sb_secret_primary_12345678901234567890",
  );
  assert.equal(
    resolveAdminKey({
      SUPABASE_SECRET_KEYS: "{malformed",
      SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role-12345678901234567890",
      SUPABASE_ANON_KEY: "legacy-anon-key-123456789012345678901",
    }),
    "legacy-service-role-12345678901234567890",
  );
  assert.throws(
    () =>
      resolveAdminKey({
        SUPABASE_SECRET_KEYS: JSON.stringify({
          default: "sb_publishable_not-an-admin-key-123456789",
        }),
      }),
    /configuration_error/u,
  );
});

test("valida WebP lossy y lossless y rechaza RIFF truncado", async () => {
  const lossy = await webp();
  const lossless = await webp(1600, 1600, true);
  assert.deepEqual(inspectWebp(lossy), {
    format: "webp",
    width: 1600,
    height: 1600,
    bytes: lossy.length,
  });
  assert.deepEqual(inspectWebp(lossless), {
    format: "webp",
    width: 1600,
    height: 1600,
    bytes: lossless.length,
  });
  assert.throws(() => inspectWebp(lossy.subarray(0, lossy.length - 1)), /invalid_webp/u);
});

test("la allowlist exige pipeline, run y prefijo de hash exactos", async () => {
  const entry = await scenario();
  const allowlist = { pipelineVersion: PIPELINE, runId: RUN_ID };
  assert.equal(validateVersionedPath(entry.storagePath, entry.hash, allowlist), entry.storagePath);
  assert.throws(
    () =>
      validateVersionedPath(
        entry.storagePath.replace(`/${RUN_ID}/`, "/otro-run/"),
        entry.hash,
        allowlist,
      ),
    /path_not_allowed/u,
  );
  assert.throws(
    () => validateVersionedPath(`../${entry.storagePath}`, entry.hash, allowlist),
    /invalid_path/u,
  );
});

test("preflight valida todo el batch y rechaza rutas duplicadas", async () => {
  const entry = await scenario();
  const allowlist = { pipelineVersion: PIPELINE, runId: RUN_ID };
  assert.equal(
    validatePreflightRequest(
      {
        action: "preflight",
        bucket: BUCKET,
        overwrite: false,
        items: [entry.spec],
      },
      allowlist,
    ).length,
    1,
  );
  assert.throws(
    () =>
      validatePreflightRequest(
        {
          action: "preflight",
          bucket: BUCKET,
          overwrite: false,
          items: [entry.spec, entry.spec],
        },
        allowlist,
      ),
    /duplicate_path/u,
  );
});

test("token incorrecto y kill switch bloquean antes de crear Storage", async () => {
  const storage = new FakeStorage();
  const active = makeHandler(storage);
  const unauthorized = await active.handler(
    new Request("https://project.supabase.co/functions/v1/catalog-image-upload-temporary", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-catalog-upload-token": "wrong-token",
      },
      body: "{}",
    }),
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(active.storageCreations(), 0);

  const disabled = makeHandler(storage, { enabled: false });
  const gone = await disabled.handler(
    new Request("https://project.supabase.co/functions/v1/catalog-image-upload-temporary", {
      method: "POST",
      headers: authorizedHeaders({ "content-type": "application/json" }),
      body: "{}",
    }),
  );
  assert.equal(gone.status, 410);
  assert.equal(disabled.storageCreations(), 0);
});

test("preflight es read-only e informa absent/matching sin sobrescribir", async () => {
  const entry = await scenario();
  const storage = new FakeStorage();
  const { handler } = makeHandler(storage);
  const absent = await preflightRequest(handler, entry.spec);
  assert.equal(absent.status, 200);
  assert.equal((await absent.json()).items[0].status, "absent");
  assert.equal(storage.uploadCalls, 0);

  storage.objects.set(entry.storagePath, entry.bytes);
  const matching = await preflightRequest(handler, entry.spec);
  assert.equal(matching.status, 200);
  assert.equal((await matching.json()).items[0].status, "matching");
  assert.equal(storage.uploadCalls, 0);
});

test("upload verifica y es idempotente same-hash", async () => {
  const entry = await scenario();
  const storage = new FakeStorage();
  const { handler } = makeHandler(storage);
  const first = await uploadRequest(handler, entry);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).status, "uploaded");
  assert.equal(storage.uploadCalls, 1);

  const repeated = await uploadRequest(handler, entry);
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).status, "already_present_matching");
  assert.equal(storage.uploadCalls, 1);
  assert.equal(storage.objects.size, 1);
});

test("un objeto existente con otro hash devuelve 409 sin escribir", async () => {
  const entry = await scenario();
  const storage = new FakeStorage();
  storage.objects.set(entry.storagePath, await webp(1600, 1600, true));
  const { handler } = makeHandler(storage);
  const response = await uploadRequest(handler, entry);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { ok: false, error: "object_conflict" });
  assert.equal(storage.uploadCalls, 0);
});

test("bytes WebP con dimensiones distintas devuelven 422 sin escribir", async () => {
  const entry = await scenario();
  entry.bytes = await webp(800, 800);
  entry.hash = await sha256Hex(entry.bytes);
  entry.storagePath = `${PRODUCT_ID}/normalized/${PIPELINE}/${RUN_ID}/sku-001-review000001-${entry.hash.slice(0, 12)}.webp`;
  const storage = new FakeStorage();
  const { handler } = makeHandler(storage);
  const response = await uploadRequest(handler, entry);
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "file_validation_failed",
  });
  assert.equal(storage.uploadCalls, 0);
});

test("ContractError nunca incluye detalles de secretos", () => {
  const error = new ContractError(401, "unauthorized");
  assert.equal(error.message, "unauthorized");
  assert.equal(error.message.includes(TOKEN), false);
});

test("el adapter Supabase fija upsert=false, usa la clave admin actual y no escribe DB", async () => {
  const source = await fs.readFile(new URL("./index.ts", import.meta.url), "utf8");
  assert.match(source, /SUPABASE_SECRET_KEYS/u);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/u);
  assert.match(source, /upsert:\s*false/u);
  assert.doesNotMatch(source, /supabase\.from\s*\(/u);
  assert.doesNotMatch(source, /\.(?:insert|update|delete|upsert|rpc)\s*\(/u);
});

test("la variante disabled responde 410 sin secretos ni Storage", async () => {
  const source = await fs.readFile(new URL("./disabled.ts", import.meta.url), "utf8");
  assert.match(source, /status:\s*410/u);
  assert.doesNotMatch(source, /Deno\.env|createClient|storage/u);
});
