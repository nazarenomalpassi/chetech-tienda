import { strict as assert } from "node:assert";
import { test } from "node:test";
import { accessTokenFor, hashToken, orderLink, safeEqual } from "../src/lib/commerce/tokens";

// La clave se lee recién al firmar, así que alcanza con cargarla antes de las pruebas.
process.env.CHECKOUT_ACCESS_SECRET = "secreto-de-prueba-con-largo-suficiente-para-hmac";

test("la clave del pedido es fija para cada pedido y distinta entre pedidos", () => {
  const id = "0b9f3b52-3d0c-4d36-9d8f-6a0ad1c2a001";
  assert.equal(accessTokenFor(id), accessTokenFor(id));
  assert.notEqual(accessTokenFor(id), accessTokenFor("0b9f3b52-3d0c-4d36-9d8f-6a0ad1c2a002"));
  assert.match(accessTokenFor(id), /^[A-Za-z0-9_-]{40,}$/);
});

test("en la base se guarda solo el resumen de la clave", () => {
  const token = accessTokenFor("0b9f3b52-3d0c-4d36-9d8f-6a0ad1c2a001");
  assert.match(hashToken(token), /^[0-9a-f]{64}$/);
  assert.notEqual(hashToken(token), token);
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
});

test("el enlace del pedido lleva número y clave", () => {
  const link = orderLink("https://chetechstore.com/", { id: "0b9f3b52-3d0c-4d36-9d8f-6a0ad1c2a001", order_number: "CHT-000123" });
  assert.match(link, /^https:\/\/chetechstore\.com\/pedido\/CHT-000123\?t=[A-Za-z0-9_-]+$/);
});
