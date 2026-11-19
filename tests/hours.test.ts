import { strict as assert } from "node:assert";
import { test } from "node:test";
import { pickupSentence, pickupWindow } from "../src/lib/hours";

// Fechas en hora de Córdoba (UTC-3). 2026-11-19 es jueves.
const at = (iso: string) => new Date(`${iso}-03:00`);

test("abierto un jueves a la tarde", () => {
  assert.deepEqual(pickupWindow(at("2026-11-19T15:00:00")), { kind: "open", closesAt: "19:00" });
});

test("antes de abrir, retira más tarde hoy", () => {
  assert.equal(pickupSentence(pickupWindow(at("2026-11-19T08:00:00"))), "Retirás hoy desde las 09:30");
});

test("el sábado al mediodía cerrado espera la tarde", () => {
  assert.deepEqual(pickupWindow(at("2026-11-21T13:30:00")), { kind: "later-today", opensAt: "16:00", closesAt: "20:00" });
});

test("el domingo pasa al lunes", () => {
  assert.equal(pickupSentence(pickupWindow(at("2026-11-22T11:00:00"))), "Retirás mañana desde las 09:30");
});

test("15 minutos antes de cerrar ya cuenta como el día siguiente", () => {
  assert.equal(pickupWindow(at("2026-11-20T18:50:00")).kind, "next-day");
});
