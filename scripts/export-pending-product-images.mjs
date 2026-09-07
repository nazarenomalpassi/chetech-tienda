import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (!["--report", "--source-root", "--output"].includes(argument) || !value) {
      throw new Error(
        "Uso: node scripts/export-pending-product-images.mjs --report <reporte.json> --source-root <carpeta> --output <carpeta>",
      );
    }
    options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  if (!options.report || !options.sourceRoot || !options.output)
    throw new Error("Faltan --report, --source-root o --output.");
  return options;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function safeSourcePath(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`))
    throw new Error(`Ruta insegura: ${relativePath}`);
  return resolved;
}

const options = parseArgs(process.argv.slice(2));
const report = JSON.parse(await fs.readFile(path.resolve(options.report), "utf8"));
const sourceRoot = path.resolve(options.sourceRoot);
const outputRoot = path.resolve(options.output);
const reviewDirectory = path.join(outputRoot, "01_REVISAR_CANDIDATO");
const unidentifiedDirectory = path.join(outputRoot, "02_SIN_IDENTIFICAR");
const productsById = new Map(report.products_snapshot.map((product) => [product.id, product]));

await fs.mkdir(reviewDirectory, { recursive: true });
await fs.mkdir(unidentifiedDirectory, { recursive: true });

const pending = [
  ...report.sections.doubtful_associations.map((row) => ({ ...row, group: "REVISAR_CANDIDATO" })),
  ...report.sections.unidentified_images.map((row) => ({ ...row, group: "SIN_IDENTIFICAR" })),
].sort((left, right) =>
  left.source_image.localeCompare(right.source_image, "es", { numeric: true }),
);

const manifestRows = [];
for (const row of pending) {
  const source = safeSourcePath(sourceRoot, row.source_image);
  const destinationDirectory =
    row.group === "REVISAR_CANDIDATO" ? reviewDirectory : unidentifiedDirectory;
  const destination = path.join(destinationDirectory, path.basename(row.source_image));
  await fs.copyFile(source, destination, constants.COPYFILE_EXCL);
  const product = productsById.get(row.product_id);
  manifestRows.push({
    original_file: path.basename(row.source_image),
    folder: row.group,
    suggested_sku: product?.sku ?? "",
    suggested_product: row.product_name ?? "",
    confidence_score: row.confidence_score ?? 0,
    reason: (row.match_reasons ?? [])
      .filter((reason) => !String(reason).startsWith("OCR:"))
      .join(" | "),
    alternative_candidates: (row.alternative_candidates ?? [])
      .map((candidate) => `${candidate.sku}: ${candidate.name}`)
      .join(" | "),
    confirmed_sku_or_new_filename: "",
  });
}

const headers = Object.keys(manifestRows[0]);
const csv = [headers, ...manifestRows.map((row) => headers.map((header) => row[header]))]
  .map((row) => row.map(csvCell).join(","))
  .join("\r\n");
await fs.writeFile(path.join(outputRoot, "PENDIENTES.csv"), `\uFEFF${csv}\r\n`, "utf8");

const instructions = `FOTOS PENDIENTES DE CHETECH
================================

Esta carpeta contiene únicamente las fotos que no se cargaron automáticamente.

01_REVISAR_CANDIDATO: 23 fotos con una sugerencia, pero sin certeza suficiente.
02_SIN_IDENTIFICAR: 8 fotos sin producto identificado de forma segura.

CÓMO RENOMBRARLAS

1. Buscá el producto correcto en el sistema y copiá su SKU exacto.
2. Renombrá la foto principal como SKU.jpg. Ejemplo: CAB-007.jpg
3. Si hay varias fotos del mismo producto, usá SKU-2.jpg, SKU-3.jpg, etc.
4. No cambies la extensión JPG ni comprimas las fotos.
5. Si la foto corresponde a un producto que todavía no existe, dejala con su nombre IMG original.

El archivo PENDIENTES.csv incluye candidatos orientativos. No tomes la sugerencia como confirmación: verificá el producto visible antes de renombrar.
`;
await fs.writeFile(path.join(outputRoot, "LEEME.txt"), instructions, "utf8");

console.log(
  JSON.stringify(
    {
      output: outputRoot,
      copied: pending.length,
      review: report.sections.doubtful_associations.length,
      unidentified: report.sections.unidentified_images.length,
    },
    null,
    2,
  ),
);
