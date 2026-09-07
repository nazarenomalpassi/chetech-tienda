import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { readEdgeUploadEnvironment, uploadApprovedViaEdge } from "./edge-upload.mjs";

const TOKEN = "temporary-test-token-with-at-least-32-characters";
const FUNCTION_URL = "http://127.0.0.1:54321/functions/v1/catalog-edge-upload";
const PUBLIC_BASE = "http://127.0.0.1/storage/v1/object/public/storefront-products";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fileSha256(filename) {
  return sha256(await fs.readFile(filename));
}

async function createWebp(width = 1600, height = 1600) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#f4f4f2",
    },
  })
    .webp({ quality: 90 })
    .toBuffer();
}

async function createScenario() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "catalog-edge-upload-"));
  const output = await createWebp();
  const outputPath = path.join(root, "approved.webp");
  await fs.writeFile(outputPath, output);
  const outputHash = sha256(output);
  const items = Array.from({ length: 185 }, (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    const productId =
      index === 0
        ? "11111111-1111-4111-8111-111111111111"
        : `22222222-2222-4222-8222-${number.padStart(12, "0")}`;
    const sourcePath = `${productId}/source-${number}.webp`;
    return {
      id: `review-${number}`,
      database_image_id: index === 0 ? "image-1" : `image-${number}`,
      product_id: productId,
      sku: `SKU-${number}`,
      is_primary: index === 0,
      position: index,
      source: {
        production_storage_path: sourcePath,
        production_url: `${PUBLIC_BASE}/${sourcePath}`,
      },
      outputs: {
        catalog: {
          path: outputPath,
          sha256: outputHash,
          width: 1600,
          height: 1600,
        },
      },
    };
  });
  const manifest = {
    run_id: "full-approved-test",
    pipeline_version: "catalog-style-v1",
    mode: "all",
    summary: { requested: 185, processed: 185, errors: 0 },
    items,
    errors: [],
  };
  const manifestPath = path.join(root, "manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const approval = {
    run_id: manifest.run_id,
    pipeline_version: manifest.pipeline_version,
    manifest_sha256: await fileSha256(manifestPath),
    scope: "all",
    decision: "approved",
    reviewed_by: "Owner",
    reviewed_at: "2026-07-28T15:00:00.000Z",
    items: items.map((item, index) => ({
      image_id: item.id,
      decision: index === 0 ? "approved" : "rejected",
    })),
  };
  const approvalPath = path.join(root, "approval.json");
  await fs.writeFile(approvalPath, `${JSON.stringify(approval, null, 2)}\n`);
  return {
    root,
    output,
    outputHash,
    manifest,
    manifestPath,
    approvalPath,
    ledgerPath: path.join(root, "edge-upload-ledger.json"),
    env: {
      CATALOG_EDGE_FUNCTION_URL: FUNCTION_URL,
      CATALOG_EDGE_UPLOAD_TOKEN: TOKEN,
    },
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createHttpMock({
  conflict = false,
  wrongPublicBytes = false,
  loseFirstUploadResponse = false,
} = {}) {
  const objects = new Map();
  const calls = { preflight: 0, upload: 0, publicGet: 0 };
  let responseWasLost = false;
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    if (url.toString().startsWith(FUNCTION_URL)) {
      assert.equal(init.method, "POST");
      assert.equal(new Headers(init.headers).get("x-catalog-upload-token"), TOKEN);
      if (typeof init.body === "string") {
        calls.preflight += 1;
        const body = JSON.parse(init.body);
        assert.equal(body.action, "preflight");
        assert.equal(body.overwrite, false);
        return jsonResponse({
          ok: true,
          action: "preflight",
          bucket: "storefront-products",
          items: body.items.map((item) => {
            const existing = objects.get(item.path);
            return {
              path: item.path,
              status: conflict || existing ? "matching" : "absent",
              sha256: conflict ? "0".repeat(64) : existing?.sha256,
              public_url: `${PUBLIC_BASE}/${item.path}`,
            };
          }),
        });
      }
      assert.ok(init.body instanceof FormData);
      calls.upload += 1;
      assert.equal(init.body.get("action"), "upload");
      assert.equal(init.body.get("overwrite"), "false");
      const storagePath = init.body.get("path");
      const file = init.body.get("file");
      const buffer = Buffer.from(await file.arrayBuffer());
      assert.equal(sha256(buffer), init.body.get("sha256"));
      const metadata = await sharp(buffer).metadata();
      const existing = objects.get(storagePath);
      if (existing) {
        assert.equal(existing.sha256, sha256(buffer));
      } else {
        objects.set(storagePath, {
          buffer,
          sha256: sha256(buffer),
        });
      }
      if (loseFirstUploadResponse && !responseWasLost) {
        responseWasLost = true;
        return jsonResponse({ ok: false }, 500);
      }
      return jsonResponse({
        ok: true,
        action: "upload",
        status: existing ? "already_present_matching" : "uploaded",
        bucket: "storefront-products",
        path: storagePath,
        sha256: sha256(buffer),
        bytes: buffer.length,
        width: metadata.width,
        height: metadata.height,
        public_url: `${PUBLIC_BASE}/${storagePath}`,
      });
    }
    if (url.toString().startsWith(PUBLIC_BASE)) {
      calls.publicGet += 1;
      const prefix = new URL(PUBLIC_BASE).pathname;
      const storagePath = decodeURIComponent(url.pathname.slice(prefix.length + 1));
      const object = objects.get(storagePath);
      if (!object) return new Response("not found", { status: 404 });
      return new Response(wrongPublicBytes ? Buffer.from("not-a-webp") : object.buffer, {
        status: 200,
        headers: { "content-type": "image/webp" },
      });
    }
    throw new Error("unexpected_url");
  };
  return { calls, fetchImpl, objects };
}

test("valida URL y secreto exclusivamente desde el entorno", () => {
  assert.throws(() => readEdgeUploadEnvironment({}), /CATALOG_EDGE_FUNCTION_URL/u);
  assert.throws(
    () =>
      readEdgeUploadEnvironment({
        CATALOG_EDGE_FUNCTION_URL: "https://example.test/function",
        CATALOG_EDGE_UPLOAD_TOKEN: "short",
      }),
    /32 caracteres/u,
  );
  assert.throws(
    () =>
      readEdgeUploadEnvironment({
        CATALOG_EDGE_FUNCTION_URL: "http://example.test/function",
        CATALOG_EDGE_UPLOAD_TOKEN: TOKEN,
      }),
    /HTTPS/u,
  );
  const result = readEdgeUploadEnvironment({
    CATALOG_EDGE_FUNCTION_URL: FUNCTION_URL,
    CATALOG_EDGE_UPLOAD_TOKEN: TOKEN,
  });
  assert.equal(result.token, TOKEN);
});

test("sube una ruta versionada, verifica el GET p\u00fablico y reanuda sin sobrescribir", async () => {
  const scenario = await createScenario();
  const http = createHttpMock();
  try {
    const first = await uploadApprovedViaEdge({
      manifestPath: scenario.manifestPath,
      approvalPath: scenario.approvalPath,
      ledgerPath: scenario.ledgerPath,
      env: scenario.env,
      fetchImpl: http.fetchImpl,
    });
    assert.equal(first.database_modified, false);
    assert.equal(first.storage_modified, true);
    assert.equal(first.uploaded, 1);
    assert.equal(first.verified, 1);
    assert.equal(http.calls.upload, 1);
    assert.equal(http.calls.publicGet, 1);

    const ledger = JSON.parse(await fs.readFile(scenario.ledgerPath, "utf8"));
    assert.equal(ledger.status, "completed");
    assert.equal(ledger.database_modified, false);
    assert.equal(ledger.storage_only, true);
    assert.equal(ledger.items[0].stage, "verified");
    assert.match(
      ledger.items[0].target.storage_path,
      /\/normalized\/catalog-style-v1\/full-approved-test\/.+\.webp$/u,
    );
    assert.equal(ledger.items[0].database_transaction.image_locator.id, "image-1");
    assert.equal(
      ledger.items[0].database_transaction.replacement_image.content_hash,
      scenario.outputHash,
    );
    assert.equal(JSON.stringify(ledger).includes(TOKEN), false);
    assert.equal(JSON.stringify(ledger).includes(FUNCTION_URL), false);

    const resumed = await uploadApprovedViaEdge({
      manifestPath: scenario.manifestPath,
      approvalPath: scenario.approvalPath,
      ledgerPath: scenario.ledgerPath,
      env: scenario.env,
      fetchImpl: http.fetchImpl,
    });
    assert.equal(resumed.verified, 1);
    assert.equal(resumed.storage_modified, false);
    assert.equal(resumed.uploaded, 0);
    assert.equal(http.calls.upload, 1);
    assert.equal(http.calls.publicGet, 2);
  } finally {
    await fs.rm(scenario.root, { recursive: true, force: true });
  }
});

test("rechaza un ledger alterado antes de continuar una reanudaci\u00f3n", async () => {
  const scenario = await createScenario();
  const http = createHttpMock();
  try {
    await uploadApprovedViaEdge({
      manifestPath: scenario.manifestPath,
      approvalPath: scenario.approvalPath,
      ledgerPath: scenario.ledgerPath,
      env: scenario.env,
      fetchImpl: http.fetchImpl,
    });
    const ledger = JSON.parse(await fs.readFile(scenario.ledgerPath, "utf8"));
    ledger.items[0].database_transaction.replacement_image.public_url =
      "https://attacker.invalid/image.webp";
    await fs.writeFile(scenario.ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
    await assert.rejects(
      uploadApprovedViaEdge({
        manifestPath: scenario.manifestPath,
        approvalPath: scenario.approvalPath,
        ledgerPath: scenario.ledgerPath,
        env: scenario.env,
        fetchImpl: http.fetchImpl,
      }),
      /fue modificado/u,
    );
    assert.equal(http.calls.upload, 1);
  } finally {
    await fs.rm(scenario.root, { recursive: true, force: true });
  }
});

test("un retry con respuesta perdida es idempotente y nunca usa overwrite", async () => {
  const scenario = await createScenario();
  const http = createHttpMock({ loseFirstUploadResponse: true });
  try {
    const result = await uploadApprovedViaEdge({
      manifestPath: scenario.manifestPath,
      approvalPath: scenario.approvalPath,
      ledgerPath: scenario.ledgerPath,
      env: scenario.env,
      fetchImpl: http.fetchImpl,
    });
    assert.equal(result.verified, 1);
    assert.equal(http.calls.upload, 2);
    assert.equal(http.objects.size, 1);
  } finally {
    await fs.rm(scenario.root, { recursive: true, force: true });
  }
});

test("un conflicto remoto detiene el lote antes de crear ledger o subir bytes", async () => {
  const scenario = await createScenario();
  const http = createHttpMock({ conflict: true });
  try {
    await assert.rejects(
      uploadApprovedViaEdge({
        manifestPath: scenario.manifestPath,
        approvalPath: scenario.approvalPath,
        ledgerPath: scenario.ledgerPath,
        env: scenario.env,
        fetchImpl: http.fetchImpl,
      }),
      /otro hash/u,
    );
    assert.equal(http.calls.upload, 0);
    await assert.rejects(fs.access(scenario.ledgerPath), /ENOENT/u);
  } finally {
    await fs.rm(scenario.root, { recursive: true, force: true });
  }
});

test("no marca verificada una respuesta p\u00fablica con bytes diferentes", async () => {
  const scenario = await createScenario();
  const http = createHttpMock({ wrongPublicBytes: true });
  try {
    await assert.rejects(
      uploadApprovedViaEdge({
        manifestPath: scenario.manifestPath,
        approvalPath: scenario.approvalPath,
        ledgerPath: scenario.ledgerPath,
        env: scenario.env,
        fetchImpl: http.fetchImpl,
      }),
      /no es una imagen v\u00e1lida/u,
    );
    const ledger = JSON.parse(await fs.readFile(scenario.ledgerPath, "utf8"));
    assert.equal(ledger.status, "failed");
    assert.equal(ledger.items[0].stage, "uploaded_unverified");
    assert.equal(ledger.items[0].last_error.includes(TOKEN), false);
  } finally {
    await fs.rm(scenario.root, { recursive: true, force: true });
  }
});

test("preflight-only valida remoto sin ledger, subida ni escritura de DB", async () => {
  const scenario = await createScenario();
  const http = createHttpMock();
  try {
    const result = await uploadApprovedViaEdge({
      manifestPath: scenario.manifestPath,
      approvalPath: scenario.approvalPath,
      ledgerPath: scenario.ledgerPath,
      env: scenario.env,
      fetchImpl: http.fetchImpl,
      preflightOnly: true,
    });
    assert.equal(result.storage_modified, false);
    assert.equal(result.database_modified, false);
    assert.equal(http.calls.preflight, 1);
    assert.equal(http.calls.upload, 0);
    await assert.rejects(fs.access(scenario.ledgerPath), /ENOENT/u);
  } finally {
    await fs.rm(scenario.root, { recursive: true, force: true });
  }
});
