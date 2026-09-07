import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  assertSafeArchivePath,
  buildProductEvidence,
  confidenceForCandidates,
  createProposedFilename,
  hammingDistance,
  normalizeText,
  rankProductCandidates,
  rowsToCsv,
} from "./lib/product-image-import.mjs";

test("normaliza tildes, mayúsculas y separadores", () => {
  assert.equal(normalizeText("Auriculares—Inalámbricos USB-C"), "auriculares inalambricos usb c");
});

test("rechaza rutas ZIP traversal y permite rutas internas", () => {
  const root = path.resolve("tmp", "safe-extract");
  assert.throws(() => assertSafeArchivePath("../secreto.txt", root), /insegura/);
  assert.throws(() => assertSafeArchivePath("C:\\Windows\\archivo.jpg", root), /insegura/);
  assert.equal(
    assertSafeArchivePath("productos/IMG_1.JPG", root),
    path.join(root, "productos", "IMG_1.JPG"),
  );
});

test("prioriza coincidencias exactas de modelo", () => {
  const products = [
    buildProductEvidence({
      id: "1",
      sku: "AUR-001",
      name: "Auricular Noga Hydra",
      model: "Hydra",
      brand: "Noga",
      category_name: "Auriculares",
    }),
    buildProductEvidence({
      id: "2",
      sku: "AUR-002",
      name: "Auricular Noga Stormer NG-8620",
      model: "NG-8620",
      brand: "Noga",
      category_name: "Auriculares",
    }),
  ];
  const ranked = rankProductCandidates(products, "NOGA STORMER NG 8620 GAMING HEADSET");
  assert.equal(ranked[0].product.id, "2");
  assert.equal(confidenceForCandidates(ranked).level, "high");
});

test("calcula distancia perceptual y serializa CSV seguro", () => {
  assert.equal(hammingDistance("0101", "0111"), 1);
  const csv = rowsToCsv([{ name: "Cable, USB-C", note: "línea\nnueva" }], ["name", "note"]);
  assert.match(csv, /"Cable, USB-C"/);
  assert.match(csv, /"línea\nnueva"/);
});

test("genera nombres WebP limpios y únicos", () => {
  const filename = createProposedFilename(
    { id: "12345678-abcd", name: "Auricular Noga", model: "NG-8620", category_name: "Auriculares" },
    "abcdef123456",
  );
  assert.equal(filename, "auriculares-ng-8620-12345678-abcdef1234.webp");
});
