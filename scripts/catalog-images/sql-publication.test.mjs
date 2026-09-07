import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import sharp from "sharp";
import { buildUploadPlan, verifyApproval } from "./storage.mjs";
import {
  edgeUploadPlanHash,
  generatePublicationSqlBundle,
  SQL_PUBLICATION_CONTRACT,
  validateVerifiedUploadLedger,
} from "./sql-publication.mjs";

const IMAGE_COUNT = 185;
const PRIMARY_COUNT = 164;
const PROJECT_REF = "ocdijruwaiwnmjmuvxzr";
const BUCKET = "storefront-products";
const FIXED_NOW = new Date("2026-07-28T18:00:00.000Z");

let fixture;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fileSha256(filename) {
  return sha256(await fs.readFile(filename));
}

function uuid(namespace, index) {
  return `${namespace.toString(16).padStart(8, "0")}-0000-4000-8000-${index
    .toString(16)
    .padStart(12, "0")}`;
}

async function writeJson(filename, value) {
  await fs.writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function buildFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "catalog-sql-publication-"));
  const filesDirectory = path.join(root, "catalog");
  await fs.mkdir(filesDirectory, { recursive: true });
  const files = await Promise.all(
    Array.from({ length: IMAGE_COUNT }, async (_, index) => {
      const filename = path.join(filesDirectory, `sku-${index + 1}.webp`);
      await sharp({
        create: {
          width: 2,
          height: 2,
          channels: 3,
          background: {
            r: index % 256,
            g: Math.floor(index / 16) % 256,
            b: (index * 17) % 256,
          },
        },
      })
        .webp({ lossless: true })
        .toFile(filename);
      const stats = await fs.stat(filename);
      return { filename, bytes: stats.size, hash: await fileSha256(filename) };
    }),
  );
  const manifest = {
    run_id: "full-sql-contract-test",
    pipeline_version: "catalog-style-v1",
    mode: "all",
    summary: { requested: IMAGE_COUNT, processed: IMAGE_COUNT, errors: 0 },
    errors: [],
    items: files.map((file, index) => {
      const number = index + 1;
      const productId = uuid(0x10000000, number);
      const imageId = uuid(0x20000000, number);
      const sku = `SKU-${String(number).padStart(3, "0")}`;
      const sourcePath = `${productId}/original-${sku.toLowerCase()}.webp`;
      return {
        id: `review-${number}`,
        database_image_id: index % 5 === 0 ? null : imageId,
        product_id: productId,
        sku,
        product_name: `Producto ${number}`,
        is_primary: index < PRIMARY_COUNT,
        position: 0,
        source: {
          production_storage_path: sourcePath,
          production_url: `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/${BUCKET}/${sourcePath}`,
        },
        outputs: {
          catalog: { path: file.filename, sha256: file.hash, width: 2, height: 2 },
        },
      };
    }),
  };
  const manifestPath = path.join(root, "manifest.json");
  await writeJson(manifestPath, manifest);
  const manifestHash = await fileSha256(manifestPath);
  const approval = {
    run_id: manifest.run_id,
    pipeline_version: manifest.pipeline_version,
    scope: "all",
    decision: "approved",
    reviewed_by: "fixture-reviewer",
    reviewed_at: "2026-07-28T17:00:00.000Z",
    manifest_sha256: manifestHash,
    items: manifest.items.map((item) => ({ image_id: item.id, decision: "approved" })),
  };
  const approvalPath = path.join(root, "approval.json");
  await writeJson(approvalPath, approval);
  const approvalHash = await fileSha256(approvalPath);
  const verified = await verifyApproval(manifestPath, approvalPath);
  const plan = await buildUploadPlan(verified.manifest, verified.approvedItems);
  const manifestByReview = new Map(manifest.items.map((item) => [item.id, item]));
  const ledger = {
    schema_version: SQL_PUBLICATION_CONTRACT.ledger_schema_version,
    kind: SQL_PUBLICATION_CONTRACT.ledger_kind,
    status: "completed",
    storage_only: true,
    database_modified: false,
    bucket: BUCKET,
    run_id: manifest.run_id,
    pipeline_version: manifest.pipeline_version,
    manifest: { path: manifestPath, sha256: manifestHash },
    approval: { path: approvalPath, sha256: approvalHash },
    plan_sha256: edgeUploadPlanHash(plan),
    counts: { planned: IMAGE_COUNT, verified: IMAGE_COUNT, pending: 0 },
    items: plan.map((planned) => {
      const manifestItem = manifestByReview.get(planned.review_id);
      const publicUrl = `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/${BUCKET}/${planned.target_storage_path}`;
      return {
        review_id: planned.review_id,
        image_id: planned.image_id,
        product_id: planned.product_id,
        sku: planned.sku,
        local: {
          path: planned.output_path,
          sha256: planned.output_hash,
          bytes: planned.output_bytes,
          width: planned.output_width,
          height: planned.output_height,
          content_type: "image/webp",
        },
        target: {
          bucket: BUCKET,
          storage_path: planned.target_storage_path,
          public_url: publicUrl,
          overwrite: false,
        },
        database_transaction: {
          image_locator: planned.image_id
            ? { type: "id", id: planned.image_id }
            : { type: "storage_path", storage_path: planned.source_storage_path },
          expected_image: {
            product_id: planned.product_id,
            storage_path: planned.source_storage_path,
            public_url: manifestItem.source.production_url,
            is_primary: manifestItem.is_primary,
            sort_order: manifestItem.position,
          },
          replacement_image: {
            storage_path: planned.target_storage_path,
            public_url: publicUrl,
            content_hash: planned.output_hash,
            width: planned.output_width,
            height: planned.output_height,
          },
          product_primary: manifestItem.is_primary
            ? {
                product_id: planned.product_id,
                expected_public_url: manifestItem.source.production_url,
                replacement_public_url: publicUrl,
              }
            : null,
        },
        stage: "verified",
        verified_at: "2026-07-28T17:30:00.000Z",
      };
    }),
  };
  const ledgerPath = path.join(root, "edge-upload-ledger.json");
  await writeJson(ledgerPath, ledger);
  return {
    root,
    manifest,
    manifestPath,
    manifestHash,
    approval,
    approvalPath,
    approvalHash,
    plan,
    ledger,
    ledgerPath,
  };
}

before(async () => {
  fixture = await buildFixture();
});

after(async () => {
  if (fixture?.root) await fs.rm(fixture.root, { recursive: true, force: true });
});

test("generates the four SQL files directly from the real edge-upload ledger contract", async () => {
  const result = await generatePublicationSqlBundle({
    manifestPath: fixture.manifestPath,
    approvalPath: fixture.approvalPath,
    uploadLedgerPath: fixture.ledgerPath,
    outputDirectory: path.join(fixture.root, "sql"),
    now: () => FIXED_NOW,
  });
  assert.equal(result.expected_images, IMAGE_COUNT);
  assert.equal(result.expected_primary_products, PRIMARY_COUNT);
  assert.equal(result.safety.writes_storage_objects, false);
  assert.equal(result.safety.updates_only_product_primary_image_url, true);
  assert.equal(result.safety.rollback_uses_atomic_admin_log_snapshot, true);

  const preflight = await fs.readFile(result.files.preflight.path, "utf8");
  const publish = await fs.readFile(result.files.publish.path, "utf8");
  const rollback = await fs.readFile(result.files.rollback.path, "utf8");
  const postflight = await fs.readFile(result.files.postflight.path, "utf8");

  assert.match(preflight, /begin transaction read only/iu);
  assert.match(preflight, /content_hash ~\* '\^\[0-9a-f\]\{64\}\$'/iu);
  assert.match(preflight, /new_storage_object_drift/iu);
  assert.doesNotMatch(preflight, /\bupdate\s+public\./iu);

  assert.match(publish, /do \$catalog_publish\$/iu);
  assert.match(publish, /for update of i/iu);
  assert.match(publish, /for update of p/iu);
  assert.match(publish, /for share of o/iu);
  assert.match(publish, /insert into public\.storefront_admin_logs/iu);
  assert.match(publish, /catalog\.images\.publish_snapshot/iu);
  assert.match(publish, /update public\.storefront_product_images/iu);
  assert.match(publish, /update public\.storefront_products p/iu);
  assert.match(publish, /set primary_image_url = s\.new_public_url/iu);
  assert.doesNotMatch(publish, /set primary_image_url[\s\S]{0,120}updated_at/iu);

  assert.match(rollback, /metadata -> 'changes'/iu);
  assert.match(rollback, /set storage_path = s\.old_storage_path/iu);
  assert.match(rollback, /primary_image_url = s\.old_product_primary_url/iu);
  assert.doesNotMatch(rollback, /\bdelete\s+from\b/iu);

  assert.match(postflight, /begin transaction read only/iu);
  assert.match(postflight, /original_objects_preserved/iu);
  assert.match(postflight, /rollback_snapshot_entity_id/iu);

  for (const sql of [preflight, publish, rollback, postflight]) {
    assert.match(sql, new RegExp(fixture.manifestHash, "u"));
    assert.doesNotMatch(sql, /\b(?:insert\s+into|update|delete\s+from)\s+storage\.objects\b/iu);
  }
});

test("rejects an incomplete, unverified, altered, or DB-modifying edge ledger", () => {
  const base = {
    manifest: fixture.manifest,
    approval: fixture.approval,
    plan: fixture.plan,
    manifestHash: fixture.manifestHash,
    approvalHash: fixture.approvalHash,
  };

  const unverified = structuredClone(fixture.ledger);
  unverified.items[0].stage = "uploaded_unverified";
  assert.throws(
    () => validateVerifiedUploadLedger({ ...base, ledger: unverified }),
    /identidad o verificación/iu,
  );

  const alteredPath = structuredClone(fixture.ledger);
  alteredPath.items[0].target.storage_path = "wrong/path.webp";
  assert.throws(
    () => validateVerifiedUploadLedger({ ...base, ledger: alteredPath }),
    /destino edge cambió/iu,
  );

  const alteredHash = structuredClone(fixture.ledger);
  alteredHash.items[0].local.sha256 = sha256("other");
  assert.throws(
    () => validateVerifiedUploadLedger({ ...base, ledger: alteredHash }),
    /salida local del ledger cambió/iu,
  );

  const modifiedDatabase = structuredClone(fixture.ledger);
  modifiedDatabase.database_modified = true;
  assert.throws(
    () => validateVerifiedUploadLedger({ ...base, ledger: modifiedDatabase }),
    /completed y storage_only/iu,
  );

  const missingItem = structuredClone(fixture.ledger);
  missingItem.items.pop();
  assert.throws(
    () => validateVerifiedUploadLedger({ ...base, ledger: missingItem }),
    /exactamente una entrada/iu,
  );
});

test("keeps null image IDs safe by resolving only their immutable source path in SQL", async () => {
  const result = await generatePublicationSqlBundle({
    manifestPath: fixture.manifestPath,
    approvalPath: fixture.approvalPath,
    uploadLedgerPath: fixture.ledgerPath,
    outputDirectory: path.join(fixture.root, "sql-null-id"),
    now: () => FIXED_NOW,
  });
  const publish = await fs.readFile(result.files.publish.path, "utf8");
  assert.match(publish, /e\.locator_image_id is null and i\.storage_path = e\.old_storage_path/iu);
  assert.match(publish, /catalog_publish_snapshot/iu);
});

test("preserves the live database sort order instead of confusing it with gallery position", async () => {
  const result = await generatePublicationSqlBundle({
    manifestPath: fixture.manifestPath,
    approvalPath: fixture.approvalPath,
    uploadLedgerPath: fixture.ledgerPath,
    outputDirectory: path.join(fixture.root, "sql-live-sort-order"),
    now: () => FIXED_NOW,
  });
  const preflight = await fs.readFile(result.files.preflight.path, "utf8");
  const publish = await fs.readFile(result.files.publish.path, "utf8");
  const rollback = await fs.readFile(result.files.rollback.path, "utf8");
  const postflight = await fs.readFile(result.files.postflight.path, "utf8");

  assert.doesNotMatch(preflight, /i\.sort_order is not distinct from e\.old_sort_order/iu);
  assert.doesNotMatch(publish, /i\.sort_order is not distinct from e\.old_sort_order/iu);
  assert.doesNotMatch(postflight, /i\.sort_order is not distinct from e\.old_sort_order/iu);
  assert.doesNotMatch(rollback, /s\.old_sort_order = e\.old_sort_order/iu);
  assert.match(publish, /i\.sort_order, i\.is_primary, i\.created_at/iu);
  assert.match(rollback, /sort_order = s\.old_sort_order/iu);
});
