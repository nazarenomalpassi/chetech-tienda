import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { mapPaymentStatus, paymentProblem, verifySignature } from "../src/lib/commerce/mercadopago";

const secret = "secreto-de-prueba";
const sign = (dataId: string, requestId: string, ts: string) =>
  createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");

test("acepta un aviso con firma correcta y reciente", () => {
  const now = 1_763_500_000_000;
  const ts = String(Math.floor(now / 1000));
  const v1 = sign("123456", "req-1", ts);
  assert.equal(verifySignature({ signature: `ts=${ts},v1=${v1}`, requestId: "req-1", dataId: "123456", secret, now }), true);
});

test("rechaza firmas alteradas, viejas o incompletas", () => {
  const now = 1_763_500_000_000;
  const ts = String(Math.floor(now / 1000));
  const v1 = sign("123456", "req-1", ts);
  assert.equal(verifySignature({ signature: `ts=${ts},v1=${v1}`, requestId: "req-1", dataId: "999999", secret, now }), false);
  assert.equal(verifySignature({ signature: `ts=${ts},v1=${v1}`, requestId: "req-2", dataId: "123456", secret, now }), false);
  assert.equal(
    verifySignature({ signature: `ts=${ts},v1=${v1}`, requestId: "req-1", dataId: "123456", secret, now: now + 3_600_000 }),
    false,
  );
  assert.equal(verifySignature({ signature: `ts=${ts}`, requestId: "req-1", dataId: "123456", secret, now }), false);
  assert.equal(verifySignature({ signature: null, requestId: "req-1", dataId: "123456", secret, now }), false);
});

const payment = {
  id: "1",
  status: "approved",
  statusDetail: "accredited",
  amount: 15000,
  currency: "ARS",
  externalReference: "CHT-000123",
  collectorId: "777",
  liveMode: false,
};

test("controla pedido, moneda, cuenta receptora y modo real", () => {
  const order = { order_number: "CHT-000123", total: 15000 };
  const config = { collectorId: "777", liveEnabled: false };
  assert.equal(paymentProblem(payment, order, config), null);
  assert.match(paymentProblem({ ...payment, externalReference: "CHT-000999" }, order, config) ?? "", /otro pedido/);
  assert.match(paymentProblem({ ...payment, currency: "USD" }, order, config) ?? "", /pesos/);
  assert.match(paymentProblem({ ...payment, collectorId: "888" }, order, config) ?? "", /otra cuenta/);
  assert.match(paymentProblem({ ...payment, liveMode: true }, order, config) ?? "", /pagos reales/);
  assert.equal(paymentProblem({ ...payment, liveMode: true }, order, { ...config, liveEnabled: true }), null);
});

test("traduce los estados de Mercado Pago", () => {
  assert.equal(mapPaymentStatus("approved"), "approved");
  assert.equal(mapPaymentStatus("in_process"), "in_process");
  assert.equal(mapPaymentStatus("rejected"), "rejected");
});
