import { strict as assert } from "node:assert";
import { test } from "node:test";
import { attributionFromLocation } from "../src/lib/attribution";

test("toma los parámetros utm del enlace", () => {
  const value = attributionFromLocation(
    "https://chetechstore.com/productos/onn?utm_source=Instagram&utm_medium=historia&utm_campaign=onn&utm_content=reel 12",
    "",
  );
  assert.equal(value?.source, "instagram");
  assert.equal(value?.medium, "historia");
  assert.equal(value?.content, "reel-12");
  assert.equal(value?.landing, "/productos/onn");
});

test("la página /ig cuenta como la biografía de Instagram", () => {
  const value = attributionFromLocation("https://chetechstore.com/ig", "");
  assert.equal(value?.source, "instagram");
  assert.equal(value?.medium, "bio");
});

test("reconoce el sitio que mandó la visita", () => {
  assert.equal(attributionFromLocation("https://chetechstore.com/", "https://l.instagram.com/x")?.source, "instagram");
  assert.equal(attributionFromLocation("https://chetechstore.com/", "https://www.google.com/")?.medium, "organico");
  assert.equal(attributionFromLocation("https://chetechstore.com/", "https://chetechstore.com/productos"), null);
  assert.equal(attributionFromLocation("https://chetechstore.com/", ""), null);
});
