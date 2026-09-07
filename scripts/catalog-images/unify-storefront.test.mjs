import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import test from "node:test";
import path from "node:path";
import { buildPipelineArgs, parseWorkflowArgs } from "./unify-storefront.mjs";
import { isCurrentCatalogStyleImage, parseArgs, toJobItem } from "./catalog-images.mjs";

test("detecta las imágenes que ya tienen el estilo vigente", () => {
  assert.equal(
    isCurrentCatalogStyleImage({
      production: {
        storage_path: "producto/normalized/catalog-style-v1/run-1/sku-hash.webp",
      },
    }),
    true,
  );
  assert.equal(
    isCurrentCatalogStyleImage({
      production: { storage_path: "producto/foto-original.jpg" },
    }),
    false,
  );
});

test("production-source usa exactamente el archivo publicado", () => {
  const item = {
    image_id: "image-1",
    product_id: "product-1",
    sku: "SKU-001",
    product_name: "Producto",
    is_primary: true,
    position: 0,
    production: {
      local_path: path.resolve("tmp", "production.webp"),
      url: "https://example.test/production.webp",
      storage_path: "product/production.webp",
    },
    source: {
      local_path: path.resolve("tmp", "original.jpg"),
      provenance: "original",
    },
  };
  const jobItem = toJobItem(item, null, { productionSource: true });
  assert.equal(jobItem.source_path, item.production.local_path);
  assert.equal(jobItem.source_provenance, "current-production-upload");
});

test("el modo pending exige la aprobación visual y acepta production-source", () => {
  const options = parseArgs([
    "--pending",
    "--pilot-approval",
    "approval.json",
    "--production-source",
  ]);
  assert.equal(options.mode, "pending");
  assert.equal(options.productionSource, true);
  assert.equal(options.pilotApproval, "approval.json");
});

test("el workflow incremental refresca inventario y usa la imagen publicada", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "chetech-unify-"));
  try {
    const approvalPath = path.join(temporaryRoot, "approval.json");
    await fs.writeFile(approvalPath, "{}\n", "utf8");
    const options = parseWorkflowArgs([]);
    options.pilotApproval = approvalPath;
    const args = await buildPipelineArgs(options);
    assert.deepEqual(args.slice(0, 3), ["--pending", "--pilot-approval", approvalPath]);
    assert.equal(args.includes("--refresh-inventory"), true);
    assert.equal(args.includes("--production-source"), true);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("el workflow por SKU procesa toda la galería de cada producto", async () => {
  const options = parseWorkflowArgs(["--sku", "aur-003", "--sku", "var-043"]);
  const args = await buildPipelineArgs(options);
  assert.deepEqual(args.slice(0, 4), ["--sku", "AUR-003", "--sku", "VAR-043"]);
  assert.equal(args.includes("--refresh-inventory"), true);
  assert.equal(args.includes("--production-source"), true);
});
