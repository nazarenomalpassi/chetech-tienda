import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isTelevision, tvCompanions } from "../src/lib/taller";
import type { Product } from "../src/lib/types";

const product = (name: string, extra: Partial<Product> = {}) =>
  ({ id: name, slug: name, name, family: "para-tu-tele", image: "https://x/y.webp", images: [], price: 1000, status: "Disponible", ...extra }) as Product;

test("reconoce un televisor por cómo lo carga el taller", () => {
  for (const value of ["Televisor", "TV LED 43", "Smart TV", "Tele Samsung"]) assert.equal(isTelevision(value), true, value);
  for (const value of ["Notebook", "Celular", "Microondas", "Equipo"]) assert.equal(isTelevision(value), false, value);
});

test("elige control, soporte, HDMI y un equipo Smart, sin agotados ni productos sin foto", () => {
  const picks = tvCompanions([
    product("Cable HDMI 1,5 m", { popularityRank: 5 }),
    product("Control remoto para TV", { popularityRank: 1 }),
    product("Control remoto LG", { popularityRank: 2 }),
    product("Soporte fijo para TV", { popularityRank: 9 }),
    product("ONN 4K", { popularityRank: 3 }),
    product("Soporte móvil agotado", { status: "Sin stock" }),
    product("Cable sin foto", { image: undefined }),
    product("Parlante", { family: "audio" }),
  ]);
  assert.deepEqual(picks.map((item) => item.name), ["Control remoto para TV", "Soporte fijo para TV", "Cable HDMI 1,5 m", "ONN 4K"]);
});
