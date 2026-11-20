import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canAutoNotify,
  modelKey,
  waitlistAutoMatch,
  waitlistMatch,
  waitlistSubject,
} from "../src/lib/waitlist-match";
import type { Product } from "../src/lib/types";

const base: Product = {
  id: "p1",
  slug: "onn-4k",
  sku: "ONN-1",
  name: "ONN 4K",
  shortDescription: "",
  description: "",
  category: "Smart TV",
  categorySlug: "smart-tv",
  family: "para-tu-tele",
  familyName: "Para tu tele",
  brand: "ONN",
  model: "4K",
  price: 150000,
  condition: "Nuevo",
  status: "Disponible",
  image: "/onn.jpg",
  images: ["/onn.jpg"],
  shipping: true,
  pickup: true,
  warranty: "Garantía de 6 meses",
  warrantyMonths: 6,
  warrantyIsLegalMinimum: true,
  compatibleWith: [],
  specifications: {},
};

const board: Product = {
  ...base,
  id: "b1",
  slug: "placa-main-lg",
  name: "Placa main LG",
  condition: "Repuesto",
  model: "EAX65610904",
  board: {
    code: "EAX65610904",
    partNumber: "EBT63439838",
    type: "main",
    compatibleModels: ["32LB561B", "32LB560B"],
  },
};

const tele: Product = {
  ...base,
  id: "r1",
  slug: "tele-43",
  name: "Smart TV 43 revisado",
  condition: "Reacondicionado",
};

test("un producto avisa solo cuando vuelve a tener stock y foto", () => {
  const entry = { kind: "product" as const, storefront_product_id: "p1", query: null };
  assert.equal(waitlistMatch(entry, [base])?.id, "p1");
  assert.equal(waitlistMatch(entry, [{ ...base, status: "Sin stock" }]), null);
  assert.equal(waitlistMatch(entry, [{ ...base, status: "Consultar disponibilidad" }]), null);
  assert.equal(waitlistMatch(entry, [{ ...base, image: undefined }]), null);
  assert.equal(waitlistMatch(entry, [{ ...base, id: "otro" }]), null);
});

test("la lista de teles revisadas avisa con cualquier reacondicionado en stock, no con una placa", () => {
  const entry = { kind: "refurbished" as const, storefront_product_id: null, query: "Tele de 43" };
  assert.equal(waitlistMatch(entry, [base, board]), null);
  assert.equal(waitlistMatch(entry, [{ ...board, condition: "Reacondicionado" }]), null);
  assert.equal(waitlistMatch(entry, [base, tele])?.id, "r1");
  assert.equal(waitlistMatch(entry, [{ ...tele, status: "Sin stock" }]), null);
});

test("una placa avisa por modelo de tele o por código, escritos de cualquier forma", () => {
  const match = (query: string) =>
    waitlistMatch({ kind: "board", storefront_product_id: null, query }, [base, board])?.id ?? null;
  assert.equal(match("32LB561B"), "b1");
  assert.equal(match("32 lb-561b"), "b1");
  assert.equal(match("eax 65610904"), "b1");
  assert.equal(match("EBT63439838"), "b1");
  assert.equal(match("65610904"), "b1");
});

test("una placa no avisa con coincidencias flojas", () => {
  const match = (query: string) =>
    waitlistMatch({ kind: "board", storefront_product_id: null, query }, [base, board]);
  assert.equal(match("32"), null);
  assert.equal(match("LG"), null);
  assert.equal(match("32LB"), null);
  assert.equal(match("43UJ6560"), null);
  assert.equal(match(""), null);
  assert.equal(
    waitlistMatch({ kind: "board", storefront_product_id: null, query: "32LB561B" }, [
      { ...board, status: "Sin stock" },
    ]),
    null,
  );
});

test("el pedido de aviso se describe en palabras", () => {
  assert.equal(
    waitlistSubject({ kind: "product", storefront_product_id: "p1", query: null }, [base]),
    "ONN 4K",
  );
  assert.equal(
    waitlistSubject({ kind: "product", storefront_product_id: "x", query: null }, [base]),
    "Un producto que ya no está publicado",
  );
  assert.equal(
    waitlistSubject({ kind: "board", storefront_product_id: null, query: "32LB561B" }, []),
    "Placa para 32LB561B",
  );
  assert.equal(
    waitlistSubject({ kind: "refurbished", storefront_product_id: null, query: null }, []),
    "Una tele revisada por el taller",
  );
  assert.equal(modelKey("Árbol 32-LB 561b"), "arbol32lb561b");
});

test("el mail automático solo sale cuando no hay dudas de que es lo que pidió", () => {
  const asked = "2026-11-10T12:00:00Z";
  const before = "2026-11-01T12:00:00Z";
  const after = "2026-11-15T12:00:00Z";
  const entry = (
    kind: "product" | "refurbished" | "board",
    query: string | null,
    email = "a@b.com",
  ) => ({
    kind,
    storefront_product_id: kind === "product" ? "p1" : null,
    query,
    email: email || null,
    created_at: asked,
  });

  // Un producto puntual: avisa apenas vuelve a tener stock, se haya publicado cuando sea.
  assert.equal(
    waitlistAutoMatch(entry("product", null), [{ ...base, publishedAt: before }])?.id,
    "p1",
  );
  // Sin mail no hay aviso automático.
  assert.equal(waitlistAutoMatch(entry("product", null, ""), [base]), null);
  assert.equal(canAutoNotify(entry("product", null, "")), false);

  // Tele revisada sin pedido puntual: solo las que entraron después de anotarse.
  assert.equal(
    waitlistAutoMatch(entry("refurbished", null), [{ ...tele, publishedAt: before }]),
    null,
  );
  assert.equal(waitlistAutoMatch(entry("refurbished", null), [tele]), null);
  assert.equal(
    waitlistAutoMatch(entry("refurbished", null), [{ ...tele, publishedAt: after }])?.id,
    "r1",
  );
  // Si escribió qué tele busca, decide una persona.
  assert.equal(
    waitlistAutoMatch(entry("refurbished", "Tele de 50"), [{ ...tele, publishedAt: after }]),
    null,
  );
  assert.equal(canAutoNotify(entry("refurbished", "Tele de 50")), false);
  assert.equal(canAutoNotify(entry("refurbished", "  ")), true);

  // Placas: coincidencia estricta y publicada después del pedido.
  assert.equal(
    waitlistAutoMatch(entry("board", "32LB561B"), [{ ...board, publishedAt: before }]),
    null,
  );
  assert.equal(
    waitlistAutoMatch(entry("board", "32LB561B"), [{ ...board, publishedAt: after }])?.id,
    "b1",
  );
  assert.equal(
    waitlistAutoMatch(entry("board", "43UJ6560"), [{ ...board, publishedAt: after }]),
    null,
  );
});
