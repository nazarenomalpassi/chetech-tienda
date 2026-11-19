import { strict as assert } from "node:assert";
import { test } from "node:test";
import { attributionFromLocation } from "../src/lib/attribution";
import { buildTrackedUrl, linkPresets } from "../src/lib/tracked-links";

const baseUrl = "https://chetechstore.com";

test("arma el enlace con origen, medio, campaña y pieza", () => {
  const url = buildTrackedUrl({ baseUrl, path: "/productos/onn-4k", source: "instagram", medium: "reel", campaign: "ONN 4K", content: "Reel del día 12" });
  assert.equal(url, "https://chetechstore.com/productos/onn-4k?utm_source=instagram&utm_medium=reel&utm_campaign=onn-4k&utm_content=reel-del-dia-12");
});

test("conserva los filtros del destino y acepta el enlace completo de la tienda", () => {
  const url = buildTrackedUrl({ baseUrl, path: "https://www.chetechstore.com/productos?familia=audio&utm_source=viejo", source: "qr", medium: "mostrador" });
  assert.equal(url, "https://chetechstore.com/productos?familia=audio&utm_source=qr&utm_medium=mostrador");
});

test("rechaza destinos de otro sitio y orígenes vacíos", () => {
  assert.equal(buildTrackedUrl({ baseUrl, path: "https://otro-sitio.com/x", source: "qr", medium: "mostrador" }), null);
  assert.equal(buildTrackedUrl({ baseUrl, path: "/", source: "  ", medium: "x" }), null);
});

test("la tienda lee de vuelta cada enlace armado", () => {
  for (const preset of linkPresets) {
    const url = buildTrackedUrl({ baseUrl, path: "/", source: preset.source, medium: preset.medium, campaign: "prueba" });
    assert.ok(url);
    const read = attributionFromLocation(url, "");
    assert.equal(read?.source, preset.source);
    assert.equal(read?.medium, preset.medium);
    assert.equal(read?.campaign, "prueba");
  }
});
