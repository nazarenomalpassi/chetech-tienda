import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(SCRIPT_DIR, "../..");
const PAGE_SIZE = 12;
const PAGE_COLUMNS = 3;
const PAGE_ROWS = 4;
const PAGE_WIDTH = 2400;
const PAGE_HEIGHT = 3200;

async function readJson(filename) {
  return JSON.parse(await fs.readFile(filename, "utf8"));
}

async function writeJson(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = path.join(
    path.dirname(filename),
    `.${path.basename(filename)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(temporary, filename);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

async function sha256(filename) {
  const data = await fs.readFile(filename);
  return createHash("sha256").update(data).digest("hex");
}

function safeFilenamePart(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function webPath(value) {
  return String(value).replaceAll("\\", "/");
}

function relativeHref(fromDirectory, filename) {
  return webPath(path.relative(fromDirectory, path.resolve(filename)));
}

function truncate(value, maximum) {
  const text = String(value ?? "");
  return text.length <= maximum ? text : `${text.slice(0, Math.max(1, maximum - 1))}…`;
}

function resultColor(result) {
  if (result === "fail") return "#B42318";
  if (result === "warn") return "#B54708";
  return "#2E6B36";
}

function resultRank(result) {
  if (result === "fail") return 0;
  if (result === "warn") return 1;
  return 2;
}

async function mapLimit(items, limit, operation) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await operation(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

async function renderProxy(item, output) {
  const comparison = await sharp(item.qa.comparison.path)
    .resize(900, 450, { fit: "contain", background: "#F4F4F2" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const edge = await sharp(item.qa.edge_check.path)
    .resize(450, 450, { fit: "contain", background: "#FFFFFF" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  await sharp({
    create: {
      width: 900,
      height: 900,
      channels: 3,
      background: "#FFFFFF",
    },
  })
    .composite([
      { input: comparison, left: 0, top: 0 },
      { input: edge, left: 225, top: 450 },
    ])
    .webp({ quality: 80, effort: 4 })
    .toFile(output);
}

function technicalReviewMaps(manifest, technicalReview) {
  const skuCounts = new Map();
  for (const item of manifest.items) {
    skuCounts.set(item.sku, (skuCounts.get(item.sku) ?? 0) + 1);
  }
  const byId = new Map();
  const byUniqueSku = new Map();
  for (const item of technicalReview?.items ?? []) {
    const id = item.image_id ?? item.id;
    if (id) byId.set(String(id), item);
    if (item.sku && skuCounts.get(item.sku) === 1) byUniqueSku.set(item.sku, item);
  }
  return { byId, byUniqueSku };
}

async function buildReviewCards(manifest, reviewDir, technicalReview = null) {
  const proxiesDir = path.join(reviewDir, "proxies");
  await fs.mkdir(proxiesDir, { recursive: true });
  const technical = technicalReviewMaps(manifest, technicalReview);
  return mapLimit(manifest.items, 4, async (item, index) => {
    const prefix = `${String(index + 1).padStart(3, "0")}-${safeFilenamePart(item.sku)}-${safeFilenamePart(item.id).slice(0, 12)}`;
    const proxyName = `${prefix}-review.webp`;
    const proxyPath = path.join(proxiesDir, proxyName);
    await renderProxy(item, proxyPath);
    const technicalItem =
      technical.byId.get(String(item.id)) ??
      technical.byId.get(String(item.database_image_id ?? "")) ??
      technical.byUniqueSku.get(item.sku) ??
      null;
    return {
      id: item.id,
      image_id: item.database_image_id,
      index: index + 1,
      sku: item.sku,
      product_name: item.product_name,
      is_primary: item.is_primary,
      position: item.position,
      automatic_result: item.qa.automatic_result,
      confidence: item.qa.confidence,
      warnings: item.qa.warnings,
      blocking_issues: item.qa.blocking_issues,
      technical_review: technicalItem,
      proxy: `proxies/${proxyName}`,
      master: relativeHref(reviewDir, item.outputs.master.path),
      comparison: relativeHref(reviewDir, item.qa.comparison.path),
      edge_check: relativeHref(reviewDir, item.qa.edge_check.path),
    };
  });
}

function captionSvg(card, width, height) {
  const result = String(card.automatic_result).toUpperCase();
  const flags = [...card.blocking_issues, ...card.warnings];
  const firstLine = `${card.sku} · ${truncate(card.product_name, 55)}`;
  const secondLine = flags.length
    ? `${result} · ${truncate(flags.join(", "), 72)}`
    : `${result} · sin alertas automáticas`;
  const color = resultColor(card.automatic_result);
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" rx="10" fill="#F5F5F2"/>
      <rect width="9" height="100%" rx="4" fill="${color}"/>
      <text x="28" y="31" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#151515">${escapeXml(firstLine)}</text>
      <text x="28" y="59" font-family="Arial, sans-serif" font-size="18" fill="${color}">${escapeXml(secondLine)}</text>
    </svg>
  `);
}

async function renderContactPage(cards, outputPath) {
  const padding = 48;
  const gap = 24;
  const cellWidth = Math.floor(
    (PAGE_WIDTH - padding * 2 - gap * (PAGE_COLUMNS - 1)) / PAGE_COLUMNS,
  );
  const cellHeight = Math.floor((PAGE_HEIGHT - padding * 2 - gap * (PAGE_ROWS - 1)) / PAGE_ROWS);
  const captionHeight = 76;
  const imageSize = Math.min(cellWidth - 16, cellHeight - captionHeight - 16);
  const inputs = [];
  for (const [index, card] of cards.entries()) {
    const row = Math.floor(index / PAGE_COLUMNS);
    const column = index % PAGE_COLUMNS;
    const left = padding + column * (cellWidth + gap);
    const top = padding + row * (cellHeight + gap);
    const imageLeft = left + Math.floor((cellWidth - imageSize) / 2);
    const proxy = await sharp(card.absolute_proxy)
      .resize(imageSize, imageSize, { fit: "contain", background: "#FFFFFF" })
      .webp({ quality: 78, effort: 3 })
      .toBuffer();
    inputs.push({ input: proxy, left: imageLeft, top });
    inputs.push({
      input: captionSvg(card, cellWidth, captionHeight),
      left,
      top: top + imageSize + 8,
    });
  }
  await sharp({
    create: {
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      channels: 3,
      background: "#FFFFFF",
    },
  })
    .composite(inputs)
    .webp({ quality: 82, effort: 4 })
    .toFile(outputPath);
}

async function createContactPages(cards, reviewDir, directoryName, prefix) {
  if (cards.length === 0) return [];
  const outputDir = path.join(reviewDir, directoryName);
  await fs.mkdir(outputDir, { recursive: true });
  const pages = [];
  for (let start = 0; start < cards.length; start += PAGE_SIZE) {
    const pageNumber = Math.floor(start / PAGE_SIZE) + 1;
    const filename = `${prefix}-${String(pageNumber).padStart(3, "0")}.webp`;
    const outputPath = path.join(outputDir, filename);
    const subset = cards.slice(start, start + PAGE_SIZE).map((card) => ({
      ...card,
      absolute_proxy: path.join(reviewDir, card.proxy),
    }));
    await renderContactPage(subset, outputPath);
    pages.push({
      page: pageNumber,
      path: `${directoryName}/${filename}`,
      items: subset.map((card) => ({
        id: card.id,
        sku: card.sku,
        result: card.automatic_result,
      })),
    });
  }
  return pages;
}

function cardsHtml(cards) {
  return cards
    .map((card) => {
      const flags = [...card.blocking_issues, ...card.warnings];
      const technical = card.technical_review
        ? `<p><strong>Revisión técnica:</strong> ${escapeHtml(card.technical_review.decision)} · ${escapeHtml(card.technical_review.notes ?? "")}</p>`
        : "";
      return `
        <article class="card" data-result="${escapeHtml(card.automatic_result)}">
          <a href="${escapeHtml(card.master)}"><img loading="lazy" decoding="async" src="${escapeHtml(card.proxy)}" alt="${escapeHtml(`${card.sku} ${card.product_name}`)}"></a>
          <div class="card-body">
            <h2>${escapeHtml(card.sku)} · ${escapeHtml(card.product_name)}</h2>
            <p class="result result-${escapeHtml(card.automatic_result)}">${escapeHtml(card.automatic_result.toUpperCase())} · confianza ${escapeHtml(card.confidence)}</p>
            <p>${flags.length ? escapeHtml(flags.join(", ")) : "Sin alertas automáticas"}</p>
            ${technical}
            <nav><a href="${escapeHtml(card.comparison)}">Antes/después</a><a href="${escapeHtml(card.edge_check)}">Bordes</a><a href="${escapeHtml(card.master)}">Master</a></nav>
          </div>
        </article>
      `;
    })
    .join("");
}

function contactLinksHtml(pages, label) {
  if (!pages.length) return "";
  return `
    <section>
      <h2>${escapeHtml(label)}</h2>
      <div class="pages">
        ${pages
          .map(
            (page) =>
              `<a href="${escapeHtml(page.path)}"><img loading="lazy" decoding="async" src="${escapeHtml(page.path)}" alt="${escapeHtml(`${label} ${page.page}`)}"><span>Página ${page.page} · ${page.items.length} imágenes</span></a>`,
          )
          .join("")}
      </div>
    </section>
  `;
}

async function writeReviewHtml({ manifest, reviewDir, cards, contactPages, exceptionPages }) {
  const errors = manifest.errors ?? [];
  const errorHtml = errors.length
    ? `<section class="errors"><h2>Errores de proceso</h2><ul>${errors
        .map(
          (error) =>
            `<li><strong>${escapeHtml(error.sku ?? "sin SKU")}</strong>: ${escapeHtml(error.error ?? error.error_type ?? "error")}</li>`,
        )
        .join("")}</ul></section>`
    : "";
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Chetech · revisión ${escapeHtml(manifest.mode)} · ${escapeHtml(manifest.run_id)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; color: #151515; background: #f2f2ef; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 1600px; margin: auto; padding: 24px; }
    header, section { margin-bottom: 28px; }
    h1 { margin-bottom: 8px; }
    .summary, .filters { display: flex; flex-wrap: wrap; gap: 10px; }
    .summary span, button { border: 1px solid #d2d2cd; background: #fff; padding: 8px 12px; border-radius: 6px; }
    button { cursor: pointer; font: inherit; }
    .pages { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
    .pages a { color: inherit; text-decoration: none; }
    .pages img { width: 100%; height: auto; display: block; border: 1px solid #ddd; background: #fff; }
    .pages span { display: block; padding-top: 6px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 18px; }
    .card { background: #fff; border: 1px solid #d9d9d4; }
    .card > a img { width: 100%; height: auto; display: block; background: #fff; }
    .card-body { padding: 14px; }
    .card h2 { margin: 0 0 8px; font-size: 18px; }
    .card p { margin: 6px 0; line-height: 1.4; }
    .result { font-weight: 700; }
    .result-pass { color: #2e6b36; }
    .result-warn { color: #b54708; }
    .result-fail { color: #b42318; }
    .card nav { display: flex; gap: 14px; margin-top: 10px; }
    .card nav a { color: #151515; }
    .card[hidden] { display: none; }
    .errors { border: 2px solid #b42318; background: #fff; padding: 16px; }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Revisión ${escapeHtml(manifest.mode)} · ${escapeHtml(manifest.pipeline_version)}</h1>
    <p>${escapeHtml(manifest.run_id)}</p>
    <div class="summary">
      <span>${cards.length} procesadas</span>
      <span>${cards.filter((card) => card.automatic_result === "pass").length} pass</span>
      <span>${cards.filter((card) => card.automatic_result === "warn").length} warn</span>
      <span>${cards.filter((card) => card.automatic_result === "fail").length} fail</span>
      <span>${errors.length} errores</span>
    </div>
  </header>
  ${errorHtml}
  ${contactLinksHtml(exceptionPages, "Excepciones")}
  ${contactLinksHtml(contactPages, "Páginas de contacto")}
  <section>
    <h2>Detalle por imagen</h2>
    <div class="filters">
      <button type="button" data-filter="all">Todas</button>
      <button type="button" data-filter="fail">Fail</button>
      <button type="button" data-filter="warn">Warn</button>
      <button type="button" data-filter="pass">Pass</button>
    </div>
    <div class="grid">${cardsHtml(cards)}</div>
  </section>
</main>
<script>
document.querySelectorAll("[data-filter]").forEach(function (button) {
  button.addEventListener("click", function () {
    var filter = button.getAttribute("data-filter");
    document.querySelectorAll(".card").forEach(function (card) {
      card.hidden = filter !== "all" && card.getAttribute("data-result") !== filter;
    });
  });
});
</script>
</body>
</html>`;
  const output = path.join(reviewDir, "index.html");
  await fs.writeFile(output, html, "utf8");
  return output;
}

export async function renderReviewReport({ manifestPath, outputDir } = {}) {
  const resolvedManifest = path.resolve(
    manifestPath ??
      path.join(
        PROJECT_DIR,
        "outputs",
        "catalog-images",
        "catalog-style-v1",
        "pilot",
        "manifest.json",
      ),
  );
  const manifest = await readJson(resolvedManifest);
  const reviewDir = path.resolve(outputDir ?? path.join(path.dirname(resolvedManifest), "review"));
  await fs.mkdir(reviewDir, { recursive: true });
  const technicalReview = await readJson(path.join(reviewDir, "qa-review.json")).catch(() => null);
  const cards = await buildReviewCards(manifest, reviewDir, technicalReview);
  const exceptions = cards
    .filter(
      (card) =>
        card.automatic_result !== "pass" ||
        card.warnings.length > 0 ||
        card.blocking_issues.length > 0,
    )
    .sort(
      (left, right) =>
        resultRank(left.automatic_result) - resultRank(right.automatic_result) ||
        left.index - right.index,
    );
  const contactPages = await createContactPages(cards, reviewDir, "contact-pages", "contact");
  const exceptionPages = await createContactPages(
    exceptions,
    reviewDir,
    "exception-pages",
    "exceptions",
  );

  const rendererManifest = path.join(reviewDir, "review-manifest.json");
  const reviewOptionsPath = path.join(reviewDir, "review-options.json");
  const approvalTemplatePath = path.join(reviewDir, "approval.template.json");
  const manifestHash = await sha256(resolvedManifest);
  await writeJson(rendererManifest, cards);
  await writeJson(reviewOptionsPath, {
    layout: "paginated-detail-review",
    page_size: PAGE_SIZE,
    page_columns: PAGE_COLUMNS,
    page_rows: PAGE_ROWS,
    proxy_count: cards.length,
    contact_pages: contactPages,
    exception_pages: exceptionPages,
  });
  await writeJson(path.join(reviewDir, "contact-index.json"), {
    schema_version: 1,
    run_id: manifest.run_id,
    pages: contactPages,
    exceptions: exceptionPages,
  });
  await writeJson(approvalTemplatePath, {
    schema_version: 1,
    run_id: manifest.run_id,
    pipeline_version: manifest.pipeline_version,
    manifest_path: resolvedManifest,
    manifest_sha256: manifestHash,
    scope: manifest.mode,
    decision: "pending",
    pilot_decision: manifest.mode === "pilot" ? "pending" : undefined,
    reviewed_by: null,
    reviewed_at: null,
    notes: "",
    items: manifest.items.map((item) => ({
      image_id: item.id,
      sku: item.sku,
      decision: "pending",
      notes: "",
    })),
  });
  const reviewFile = await writeReviewHtml({
    manifest,
    reviewDir,
    cards,
    contactPages,
    exceptionPages,
  });

  const summaryPath = path.join(reviewDir, "summary.json");
  await writeJson(summaryPath, {
    generated_at: new Date().toISOString(),
    run_id: manifest.run_id,
    pipeline_version: manifest.pipeline_version,
    published: false,
    database_modified: false,
    storage_modified: false,
    report: reviewFile,
    contact_sheet: contactPages[0] ? path.join(reviewDir, contactPages[0].path) : null,
    contact_sheets: contactPages.map((page) => path.join(reviewDir, page.path)),
    exception_sheets: exceptionPages.map((page) => path.join(reviewDir, page.path)),
    approval_template: approvalTemplatePath,
    proxy_count: cards.length,
    counts: manifest.summary,
  });
  return JSON.parse(await fs.readFile(summaryPath, "utf8"));
}
