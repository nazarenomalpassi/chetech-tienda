import { strict as assert } from "node:assert";
import { test } from "node:test";
import { discountLines } from "../src/lib/commerce/discounts";
import { buildPreference, type MercadoPagoConfig } from "../src/lib/commerce/mercadopago";

test("un pedido sin descuento no muestra renglones de descuento", () => {
  assert.deepEqual(discountLines({ discount_total: 0, coupon_code: null, discount_detail: {} }), []);
  assert.deepEqual(discountLines({ discount_total: "0.00" }), []);
});

test("detalla cupón y transferencia por separado", () => {
  const lines = discountLines({
    discount_total: 13920,
    coupon_code: "REEL10",
    discount_detail: {
      coupon: { code: "REEL10", percent: 10, scope: "all", amount: 9600 },
      transfer: { percent: 5, amount: 4320 },
    },
  });
  assert.deepEqual(lines, [
    { label: "Cupón REEL10 (10 %)", amount: 9600 },
    { label: "Pago por transferencia (5 %)", amount: 4320 },
  ]);
});

test("si falta el detalle, el descuento se muestra igual", () => {
  assert.deepEqual(discountLines({ discount_total: 500, coupon_code: "TALLER", discount_detail: null }), [
    { label: "Cupón TALLER", amount: 500 },
  ]);
  assert.deepEqual(discountLines({ discount_total: 500 }), [{ label: "Descuento", amount: 500 }]);
});

const config = { siteUrl: "https://tienda.ejemplo" } as MercadoPagoConfig;
const base = {
  orderId: "0f8fad5b-d9cb-469f-a165-70867728950e",
  orderNumber: "CHT-000123",
  accessToken: "clave",
  items: [
    { sku: "CAR-001", name: "Cargador", quantity: 2, unitPrice: 18000 },
    { sku: "CAB-012", name: "Cable HDMI", quantity: 1, unitPrice: 6000 },
  ],
  shippingCost: 3500,
  payerEmail: "cliente@example.com",
  payerName: "Cliente De Prueba",
  expiresAt: "2026-11-20T12:00:00.000Z",
};
const sum = (items: { quantity: number; unit_price: number }[]) =>
  items.reduce((total, item) => total + item.quantity * item.unit_price, 0);

test("Mercado Pago cobra el detalle completo cuando no hay descuento", () => {
  const preference = buildPreference(config, base);
  assert.equal(preference.items.length, 3);
  assert.equal(sum(preference.items), 45500);
});

test("con descuento, Mercado Pago cobra exactamente el total del pedido", () => {
  const preference = buildPreference(config, { ...base, discountTotal: 4200 });
  assert.equal(preference.items.length, 2);
  assert.equal(preference.items[0].unit_price, 37800);
  assert.equal(sum(preference.items), 42000 - 4200 + 3500);
  assert.ok(preference.items.every((item) => item.unit_price >= 0));
});
