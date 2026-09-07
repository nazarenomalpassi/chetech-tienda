import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  createSupabaseStorageAdapter,
  rollbackUpload,
  uploadApproved,
  validateManifestForUpload,
} from "./storage.mjs";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function webp(width, height, color) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .webp({ quality: 90 })
    .toBuffer();
}

class FakeAdapter {
  constructor({ row, product, originalPath, originalBuffer }) {
    this.images = new Map([[row.id, structuredClone(row)]]);
    this.products = new Map([[product.id, structuredClone(product)]]);
    this.objects = new Map();
    this.writes = 0;
    this.failUpdateProductOnce = false;
    this.driftImageBeforeUpdateOnce = null;
    this.driftProductBeforeUpdateOnce = null;
    this.ready = this.setObject(originalPath, originalBuffer);
  }

  async setObject(storagePath, buffer) {
    const metadata = await sharp(buffer).metadata();
    this.objects.set(storagePath, {
      buffer: Buffer.from(buffer),
      sha256: sha256(buffer),
      bytes: buffer.length,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    });
  }

  async getImage({ imageId, storagePath }) {
    const row = imageId
      ? this.images.get(imageId)
      : [...this.images.values()].find((item) => item.storage_path === storagePath);
    if (!row) throw new Error("image_not_found");
    return structuredClone(row);
  }

  async findImagesByHashes(hashes) {
    return [...this.images.values()]
      .filter((row) => hashes.includes(row.content_hash))
      .map((row) => structuredClone(row));
  }

  async getProduct(productId) {
    const product = this.products.get(productId);
    if (!product) throw new Error("product_not_found");
    return structuredClone(product);
  }

  async updateImage(imageId, values, expected) {
    const row = this.images.get(imageId);
    if (this.driftImageBeforeUpdateOnce) {
      Object.assign(row, this.driftImageBeforeUpdateOnce);
      this.driftImageBeforeUpdateOnce = null;
    }
    if (row.storage_path !== expected.storage_path || row.public_url !== expected.public_url) {
      throw new Error("image_compare_and_swap_conflict");
    }
    this.writes += 1;
    Object.assign(row, values);
    return structuredClone(row);
  }

  async updateProduct(productId, values, expected) {
    if (this.failUpdateProductOnce) {
      this.failUpdateProductOnce = false;
      throw new Error("injected_product_failure");
    }
    const product = this.products.get(productId);
    if (this.driftProductBeforeUpdateOnce) {
      Object.assign(product, this.driftProductBeforeUpdateOnce);
      this.driftProductBeforeUpdateOnce = null;
    }
    if (product.primary_image_url !== expected.primary_image_url) {
      throw new Error("product_compare_and_swap_conflict");
    }
    this.writes += 1;
    Object.assign(product, values);
    return structuredClone(product);
  }

  async uploadObject(storagePath, buffer) {
    this.writes += 1;
    if (this.objects.has(storagePath)) throw new Error("object_exists");
    await this.setObject(storagePath, buffer);
  }

  async removeObject(storagePath) {
    this.writes += 1;
    this.objects.delete(storagePath);
  }

  async inspectObject(storagePath) {
    const object = this.objects.get(storagePath);
    return object
      ? {
          ...object,
          buffer: Buffer.from(object.buffer),
        }
      : null;
  }

  publicUrl(storagePath) {
    return `https://storage.test/${storagePath}`;
  }
}

async function createScenario() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "catalog-storage-test-"));
  const originalPath = "product-1/original.webp";
  const originalBuffer = await webp(2, 2, "#101010");
  const outputBuffer = await webp(4, 4, "#30c040");
  const outputPath = path.join(root, "approved.webp");
  await fs.writeFile(outputPath, outputBuffer);
  const originalUrl = `https://storage.test/${originalPath}`;
  const row = {
    id: "image-1",
    storefront_product_id: "product-1",
    storage_path: originalPath,
    public_url: originalUrl,
    alt_text: "Producto",
    content_hash: sha256(originalBuffer),
    width: 2,
    height: 2,
    sort_order: 0,
    is_primary: true,
  };
  const manifestItems = Array.from({ length: 185 }, (_, index) => ({
    id: `review-${String(index + 1).padStart(3, "0")}`,
    database_image_id: index === 0 ? row.id : `unused-${index}`,
    product_id: index === 0 ? "product-1" : `unused-product-${index}`,
    sku: index === 0 ? "SKU-001" : `REJ-${String(index).padStart(3, "0")}`,
    source: {
      production_storage_path: index === 0 ? originalPath : `unused-product-${index}/original.webp`,
    },
    outputs: {
      catalog: {
        path: outputPath,
        sha256: sha256(outputBuffer),
        width: 4,
        height: 4,
      },
    },
  }));
  const manifest = {
    run_id: "all-test-run",
    pipeline_version: "catalog-style-v1",
    mode: "all",
    summary: { requested: 185, processed: 185, errors: 0 },
    items: manifestItems,
    errors: [],
  };
  const manifestPath = path.join(root, "manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const approval = {
    run_id: manifest.run_id,
    pipeline_version: manifest.pipeline_version,
    manifest_sha256: await fileHash(manifestPath),
    scope: "all",
    decision: "approved",
    reviewed_by: "Owner",
    reviewed_at: "2026-07-28T15:00:00.000Z",
    items: manifestItems.map((item, index) => ({
      image_id: item.id,
      decision: index === 0 ? "approved" : "rejected",
    })),
  };
  const approvalPath = path.join(root, "approval.json");
  await fs.writeFile(approvalPath, `${JSON.stringify(approval, null, 2)}\n`);
  const rollbackPath = path.join(root, "upload-rollback.json");
  const adapter = new FakeAdapter({
    row,
    product: { id: "product-1", primary_image_url: originalUrl },
    originalPath,
    originalBuffer,
  });
  await adapter.ready;
  return {
    root,
    manifest,
    manifestPath,
    approvalPath,
    rollbackPath,
    adapter,
    row,
    originalPath,
  };
}

async function fileHash(filename) {
  return createHash("sha256")
    .update(await fs.readFile(filename))
    .digest("hex");
}

function createEmptyUpdateClient() {
  const filters = [];
  const builder = {
    update() {
      return this;
    },
    eq(column, value) {
      filters.push(["eq", column, value]);
      return this;
    },
    is(column, value) {
      filters.push(["is", column, value]);
      return this;
    },
    select() {
      return this;
    },
    async maybeSingle() {
      return { data: null, error: null };
    },
  };
  return {
    filters,
    client: {
      from() {
        return builder;
      },
    },
  };
}

test("validateManifestForUpload exige 185 procesadas y cero errores", () => {
  assert.throws(
    () =>
      validateManifestForUpload({
        mode: "all",
        summary: { requested: 184, processed: 184, errors: 0 },
        items: [],
        errors: [],
      }),
    /185\/185/u,
  );
  const items = Array.from({ length: 185 }, (_, index) => ({ id: `id-${index}` }));
  assert.doesNotThrow(() =>
    validateManifestForUpload({
      mode: "all",
      summary: { requested: 185, processed: 185, errors: 0 },
      items,
      errors: [],
    }),
  );
});

test("el adapter aplica filtros CAS y trata cero filas como conflicto", async () => {
  const imageStub = createEmptyUpdateClient();
  const imageAdapter = createSupabaseStorageAdapter(imageStub.client);
  await assert.rejects(
    imageAdapter.updateImage(
      "image-1",
      { public_url: "https://new.test/image.webp" },
      {
        storage_path: "product/original.webp",
        public_url: "https://old.test/image.webp",
      },
    ),
    /compare-and-swap/u,
  );
  assert.deepEqual(imageStub.filters, [
    ["eq", "id", "image-1"],
    ["eq", "storage_path", "product/original.webp"],
    ["eq", "public_url", "https://old.test/image.webp"],
  ]);

  const productStub = createEmptyUpdateClient();
  const productAdapter = createSupabaseStorageAdapter(productStub.client);
  await assert.rejects(
    productAdapter.updateProduct(
      "product-1",
      { primary_image_url: "https://new.test/image.webp" },
      { primary_image_url: "https://old.test/image.webp" },
    ),
    /compare-and-swap/u,
  );
  assert.deepEqual(productStub.filters, [
    ["eq", "id", "product-1"],
    ["eq", "primary_image_url", "https://old.test/image.webp"],
  ]);
});

test("upload es verificable, reanudable e idempotente; rollback también", async () => {
  const scenario = await createScenario();
  try {
    const first = await uploadApproved({
      manifestPath: scenario.manifestPath,
      approvalPath: scenario.approvalPath,
      rollbackPath: scenario.rollbackPath,
      adapter: scenario.adapter,
    });
    assert.equal(first.post_batch_verification, "passed");
    const ledger = JSON.parse(await fs.readFile(scenario.rollbackPath, "utf8"));
    assert.equal(ledger.status, "completed");
    assert.equal(ledger.changes[0].stage, "verified");
    assert.equal(
      scenario.adapter.images.get(scenario.row.id).storage_path,
      ledger.changes[0].replacement.storage_path,
    );
    assert.equal(scenario.adapter.objects.has(scenario.originalPath), true);

    const resumed = await uploadApproved({
      manifestPath: scenario.manifestPath,
      approvalPath: scenario.approvalPath,
      rollbackPath: scenario.rollbackPath,
      adapter: scenario.adapter,
    });
    assert.equal(resumed.resumed, true);

    const rolledBack = await rollbackUpload({
      rollbackPath: scenario.rollbackPath,
      adapter: scenario.adapter,
    });
    assert.equal(rolledBack.post_rollback_verification, "passed");
    assert.equal(scenario.adapter.images.get(scenario.row.id).storage_path, scenario.originalPath);
    assert.equal(scenario.adapter.objects.has(scenario.originalPath), true);
    assert.equal(scenario.adapter.objects.size, 1);

    const resumedRollback = await rollbackUpload({
      rollbackPath: scenario.rollbackPath,
      adapter: scenario.adapter,
    });
    assert.equal(resumedRollback.post_rollback_verification, "passed");
  } finally {
    await fs.rm(scenario.root, { recursive: true, force: true });
  }
});

test("un fallo intermedio compensa el ítem y permite reanudar", async () => {
  const scenario = await createScenario();
  try {
    scenario.adapter.failUpdateProductOnce = true;
    await assert.rejects(
      uploadApproved({
        manifestPath: scenario.manifestPath,
        approvalPath: scenario.approvalPath,
        rollbackPath: scenario.rollbackPath,
        adapter: scenario.adapter,
      }),
      /fue compensado/u,
    );
    const failedLedger = JSON.parse(await fs.readFile(scenario.rollbackPath, "utf8"));
    assert.equal(failedLedger.status, "failed_item_compensated");
    assert.equal(failedLedger.changes[0].stage, "compensated");
    assert.equal(scenario.adapter.images.get(scenario.row.id).storage_path, scenario.originalPath);
    assert.equal(scenario.adapter.objects.size, 1);

    const resumed = await uploadApproved({
      manifestPath: scenario.manifestPath,
      approvalPath: scenario.approvalPath,
      rollbackPath: scenario.rollbackPath,
      adapter: scenario.adapter,
    });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.post_batch_verification, "passed");
  } finally {
    await fs.rm(scenario.root, { recursive: true, force: true });
  }
});

test("compare-and-swap no sobreescribe una imagen que cambió entre lectura y UPDATE", async () => {
  const scenario = await createScenario();
  const externalUrl = "https://storage.test/external/image.webp";
  try {
    scenario.adapter.driftImageBeforeUpdateOnce = { public_url: externalUrl };
    await assert.rejects(
      uploadApproved({
        manifestPath: scenario.manifestPath,
        approvalPath: scenario.approvalPath,
        rollbackPath: scenario.rollbackPath,
        adapter: scenario.adapter,
      }),
      /compensación no pudo completarse/u,
    );
    const ledger = JSON.parse(await fs.readFile(scenario.rollbackPath, "utf8"));
    assert.equal(ledger.status, "compensation_failed");
    assert.equal(scenario.adapter.images.get(scenario.row.id).public_url, externalUrl);
    assert.equal(scenario.adapter.images.get(scenario.row.id).storage_path, scenario.originalPath);
    assert.equal(scenario.adapter.objects.has(ledger.changes[0].replacement.storage_path), false);
    assert.equal(scenario.adapter.objects.has(scenario.originalPath), true);
  } finally {
    await fs.rm(scenario.root, { recursive: true, force: true });
  }
});

test("compare-and-swap no sobreescribe la imagen principal si el producto tuvo drift", async () => {
  const scenario = await createScenario();
  const externalUrl = "https://storage.test/external/product.webp";
  try {
    scenario.adapter.driftProductBeforeUpdateOnce = { primary_image_url: externalUrl };
    await assert.rejects(
      uploadApproved({
        manifestPath: scenario.manifestPath,
        approvalPath: scenario.approvalPath,
        rollbackPath: scenario.rollbackPath,
        adapter: scenario.adapter,
      }),
      /compensación no pudo completarse/u,
    );
    const ledger = JSON.parse(await fs.readFile(scenario.rollbackPath, "utf8"));
    assert.equal(ledger.status, "compensation_failed");
    assert.equal(
      scenario.adapter.products.get(scenario.row.storefront_product_id).primary_image_url,
      externalUrl,
    );
    assert.equal(scenario.adapter.images.get(scenario.row.id).storage_path, scenario.originalPath);
    assert.equal(scenario.adapter.objects.has(ledger.changes[0].replacement.storage_path), true);
  } finally {
    await fs.rm(scenario.root, { recursive: true, force: true });
  }
});

test("rollback usa compare-and-swap y preserva drift externo", async () => {
  const scenario = await createScenario();
  const externalUrl = "https://storage.test/external/rollback.webp";
  try {
    await uploadApproved({
      manifestPath: scenario.manifestPath,
      approvalPath: scenario.approvalPath,
      rollbackPath: scenario.rollbackPath,
      adapter: scenario.adapter,
    });
    const uploadedLedger = JSON.parse(await fs.readFile(scenario.rollbackPath, "utf8"));
    scenario.adapter.driftImageBeforeUpdateOnce = { public_url: externalUrl };
    await assert.rejects(
      rollbackUpload({
        rollbackPath: scenario.rollbackPath,
        adapter: scenario.adapter,
      }),
      /compare_and_swap_conflict/u,
    );
    const ledger = JSON.parse(await fs.readFile(scenario.rollbackPath, "utf8"));
    assert.equal(ledger.status, "rollback_failed");
    assert.equal(scenario.adapter.images.get(scenario.row.id).public_url, externalUrl);
    assert.equal(
      scenario.adapter.images.get(scenario.row.id).storage_path,
      uploadedLedger.changes[0].replacement.storage_path,
    );
    assert.equal(
      scenario.adapter.objects.has(uploadedLedger.changes[0].replacement.storage_path),
      true,
    );
  } finally {
    await fs.rm(scenario.root, { recursive: true, force: true });
  }
});

test("el preflight remoto detecta un hash ajeno antes de escribir", async () => {
  const scenario = await createScenario();
  try {
    const outputHash = scenario.manifest.items[0].outputs.catalog.sha256;
    scenario.adapter.images.set("conflict-image", {
      id: "conflict-image",
      storefront_product_id: "other-product",
      storage_path: "other/conflict.webp",
      public_url: "https://storage.test/other/conflict.webp",
      alt_text: "Otro",
      content_hash: outputHash,
      width: 4,
      height: 4,
      sort_order: 0,
      is_primary: true,
    });
    const writesBefore = scenario.adapter.writes;
    await assert.rejects(
      uploadApproved({
        manifestPath: scenario.manifestPath,
        approvalPath: scenario.approvalPath,
        rollbackPath: scenario.rollbackPath,
        dryRun: true,
        adapter: scenario.adapter,
      }),
      /otra imagen/u,
    );
    assert.equal(scenario.adapter.writes, writesBefore);
    await assert.rejects(fs.access(scenario.rollbackPath), /ENOENT/u);
  } finally {
    await fs.rm(scenario.root, { recursive: true, force: true });
  }
});
