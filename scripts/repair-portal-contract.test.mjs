import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function source(relativePath) {
  return readFile(join(projectRoot, relativePath), "utf8");
}

test("el portal usa exclusivamente los tres RPC públicos acordados", async () => {
  const repairs = await source("src/lib/repairs.ts");
  for (const rpc of [
    "get_my_customer_repairs",
    "get_my_customer_repair",
    "get_my_customer_repairs_summary",
  ]) {
    assert.match(repairs, new RegExp(`\\.rpc\\("${rpc}"`));
  }
  assert.doesNotMatch(repairs, /\.from\(\s*["']repair_access_/);
  assert.doesNotMatch(repairs, /service_role|SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(repairs, /\.select\(\s*["']\*/);
  assert.match(
    repairs,
    /\.filter\(\(update\) => repair\.budget \|\| update\.eventType !== "budget"\)/,
  );
});

test("las páginas privadas no consultan tablas operativas directamente", async () => {
  const [listPage, detailPage] = await Promise.all([
    source("src/app/cuenta/reparaciones/page.tsx"),
    source("src/app/cuenta/reparaciones/[id]/page.tsx"),
  ]);
  for (const page of [listPage, detailPage]) {
    assert.doesNotMatch(page, /\.from\(/);
    assert.doesNotMatch(page, /repair_access_orders|repair_access_updates/);
  }
});

test("el detalle presenta los tres datos del taller con etiquetas claras", async () => {
  const detailPage = await source("src/app/cuenta/reparaciones/[id]/page.tsx");
  assert.match(detailPage, /Avance de reparación/);
  assert.match(detailPage, /<p className="eyebrow">Presupuesto<\/p>/);
  assert.match(detailPage, /<dt>Detalle del presupuesto<\/dt>/);
});

test("se conservan los ocho estados reales y el estado vacío acordado", async () => {
  const [repairs, listPage] = await Promise.all([
    source("src/lib/repairs.ts"),
    source("src/app/cuenta/reparaciones/page.tsx"),
  ]);
  for (const status of [
    "pendiente_revision",
    "en_revision",
    "presupuestado",
    "presupuestado_aceptado",
    "presupuestado_rechazado",
    "listo_para_retirar",
    "retirado",
    "sin_solucion",
  ]) {
    assert.match(repairs, new RegExp(`${status}:`));
  }
  assert.match(listPage, /Todavía no tenés reparaciones asociadas a tu cuenta\./);
  assert.match(
    listPage,
    /Cuando ingreses un equipo a nuestro servicio técnico, vas a poder seguirlo desde acá\./,
  );
});
