import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { renderReviewReport } from "./report.mjs";

sharp.cache(false);

async function createImage(filename, width, height, color, format) {
  let pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  });
  if (format === "jpeg") pipeline = pipeline.jpeg({ quality: 80 });
  else pipeline = pipeline.png();
  await pipeline.toFile(filename);
}

test("full review uses paginated proxies and a separate exceptions sheet", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "chetech-report-"));
  try {
    const itemsRoot = path.join(root, "items");
    const reviewRoot = path.join(root, "review");
    await fs.mkdir(itemsRoot, { recursive: true });
    const items = [];
    for (let index = 0; index < 25; index += 1) {
      const stem = `sku-${String(index + 1).padStart(3, "0")}`;
      const itemRoot = path.join(itemsRoot, stem);
      await fs.mkdir(itemRoot, { recursive: true });
      const comparison = path.join(itemRoot, "comparison.jpg");
      const edge = path.join(itemRoot, "edge.png");
      const master = path.join(itemRoot, "master.png");
      await Promise.all([
        createImage(comparison, 200, 100, "#d8d8d8", "jpeg"),
        createImage(edge, 120, 120, "#c9ff18", "png"),
        createImage(master, 160, 160, "#f4f4f2", "png"),
      ]);
      const automaticResult = index === 1 ? "fail" : index % 5 === 0 ? "warn" : "pass";
      items.push({
        id: `image-${index + 1}`,
        database_image_id: `database-${index + 1}`,
        product_id: `product-${index + 1}`,
        sku: `SKU-${String(index + 1).padStart(3, "0")}`,
        product_name: `Producto de prueba ${index + 1}`,
        is_primary: true,
        position: 0,
        outputs: { master: { path: master } },
        qa: {
          comparison: { path: comparison },
          edge_check: { path: edge },
          automatic_result: automaticResult,
          confidence: automaticResult === "pass" ? 1 : 0.7,
          warnings: automaticResult === "warn" ? ["synthetic_warning"] : [],
          blocking_issues: automaticResult === "fail" ? ["synthetic_failure"] : [],
        },
      });
    }
    const manifestPath = path.join(root, "manifest.json");
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          run_id: "full-test",
          pipeline_version: "catalog-style-v1",
          mode: "all",
          summary: {
            requested: 25,
            processed: 25,
            errors: 0,
            automatic_pass: 19,
            automatic_warn: 5,
            automatic_fail: 1,
            pending_manual_review: 25,
          },
          items,
          errors: [],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const summary = await renderReviewReport({
      manifestPath,
      outputDir: reviewRoot,
    });
    assert.equal(summary.proxy_count, 25);
    assert.equal(summary.contact_sheets.length, 3);
    assert.equal(summary.exception_sheets.length, 1);
    assert.equal((await fs.readdir(path.join(reviewRoot, "proxies"))).length, 25);
    await assert.rejects(fs.access(path.join(reviewRoot, "assets")));

    const firstPage = await sharp(await fs.readFile(summary.contact_sheets[0])).metadata();
    assert.equal(firstPage.width, 2400);
    assert.equal(firstPage.height, 3200);

    const html = await fs.readFile(path.join(reviewRoot, "index.html"), "utf8");
    assert.match(html, /loading="lazy"/);
    assert.match(html, /Páginas de contacto/);
    assert.match(html, /Excepciones/);

    const approval = JSON.parse(
      await fs.readFile(path.join(reviewRoot, "approval.template.json"), "utf8"),
    );
    assert.equal(approval.scope, "all");
    assert.equal(approval.items.length, 25);
  } finally {
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  }
});
