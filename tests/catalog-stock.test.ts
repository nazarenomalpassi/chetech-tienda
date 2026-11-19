import { strict as assert } from "node:assert";
import { test } from "node:test";
import { queryCatalog } from "../src/lib/catalog-query";
import type { Product } from "../src/lib/types";

const product = (id: string, status: Product["status"], family = "audio"): Product =>
  ({
    id,
    slug: id,
    sku: id.toUpperCase(),
    name: `Producto ${id}`,
    shortDescription: "",
    description: "",
    category: "Auriculares",
    categorySlug: "auriculares",
    family,
    familyName: "Audio",
    price: 1000,
    image: "/foto.webp",
    images: ["/foto.webp"],
    status,
    condition: "Nuevo",
    compatibleWith: [],
    specifications: {},
  }) as unknown as Product;

const all = [
  product("a", "Disponible"),
  product("b", "Últimas unidades"),
  product("c", "Sin stock"),
  product("d", "Consultar disponibilidad", "hogar"),
];

test("cuenta lo que se puede llevar hoy sin filtrar", () => {
  const result = queryCatalog(all);
  assert.equal(result.total, 4);
  assert.deepEqual(result.stock, { available: 2, unavailable: 2 });
});

test("el filtro deja solo lo que hay en stock", () => {
  const result = queryCatalog(all, { availableToday: true });
  assert.deepEqual(result.products.map((item) => item.id).sort(), ["a", "b"]);
  assert.deepEqual(result.stock, { available: 2, unavailable: 2 });
});

test("el conteo de stock respeta la familia elegida", () => {
  const result = queryCatalog(all, { family: "hogar" });
  assert.deepEqual(result.stock, { available: 0, unavailable: 1 });
});
