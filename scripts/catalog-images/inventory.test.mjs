import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readInventory, resolveStorageBackupPath, summarizeInventory } from "./inventory.mjs";
import { chooseHighestResolutionCandidate } from "./source-resolver.mjs";

test("resolveStorageBackupPath conserva la jerarquia y rechaza traversal", () => {
  const root = path.resolve("tmp", "catalog-backup-test");
  assert.equal(
    resolveStorageBackupPath(root, "product-id/image.webp"),
    path.join(root, "product-id", "image.webp"),
  );
  assert.throws(() => resolveStorageBackupPath(root, "../secret.txt"), /insegura/u);
  assert.throws(() => resolveStorageBackupPath(root, "C:\\Windows\\secret.txt"), /insegura/u);
});

test("chooseHighestResolutionCandidate prioriza pixeles y luego bytes", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "catalog-source-choice-"));
  const candidates = [
    { localPath: path.join(temporaryRoot, "small.jpg"), provenance: "small", priority: 99 },
    { localPath: path.join(temporaryRoot, "large.jpg"), provenance: "large", priority: 0 },
  ];
  await Promise.all(candidates.map((candidate) => fs.writeFile(candidate.localPath, "")));
  const inspected = new Map([
    [
      candidates[0].localPath,
      { local_path: candidates[0].localPath, width: 1000, height: 1000, bytes: 900_000 },
    ],
    [
      candidates[1].localPath,
      { local_path: candidates[1].localPath, width: 1600, height: 1200, bytes: 500_000 },
    ],
  ]);
  const result = await chooseHighestResolutionCandidate(candidates, async (filename) =>
    inspected.get(filename),
  );
  assert.equal(result.selected.provenance, "large");
  await fs.rm(temporaryRoot, { recursive: true, force: true });
});

test("readInventory valida el contrato y summarizeInventory cuenta galerias", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "catalog-inventory-"));
  const validPath = path.join(temporaryRoot, "inventory.json");
  await fs.writeFile(
    validPath,
    JSON.stringify({ summary: { image_rows: 1 }, items: [{ image_id: "1" }] }),
  );
  assert.equal((await readInventory(validPath)).items.length, 1);

  const products = [{ id: "p1" }, { id: "p2" }];
  const items = [
    {
      product_id: "p1",
      is_primary: true,
      production: { bytes: 10, download_status: "downloaded" },
      source: { bytes: 20 },
      warnings: [],
    },
    {
      product_id: "p1",
      is_primary: false,
      production: { bytes: 12, download_status: "reused_immutable_backup" },
      source: null,
      warnings: ["missing"],
    },
  ];
  const summary = summarizeInventory(items, products, "public_rpc");
  assert.equal(summary.visible_products, 2);
  assert.equal(summary.image_rows, 2);
  assert.equal(summary.products_with_multiple_images, 1);
  assert.equal(summary.products_without_images, 1);
  assert.equal(summary.production_bytes, 22);
  assert.equal(summary.source_bytes, 20);
  await fs.rm(temporaryRoot, { recursive: true, force: true });
});
