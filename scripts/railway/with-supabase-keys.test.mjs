import assert from "node:assert/strict";
import test from "node:test";

import { deriveRoleKey } from "./with-supabase-keys.mjs";

// Vector calculado con la implementación original en Go (6ixfalls/supabase, secrets.Derive)
// a partir de un secreto de prueba; es el mismo que usa el sistema de gestión.
// Si cambia, la tienda dejaría de entrar a la base.
const ROOT = "prueba-de-derivacion-con-al-menos-treinta-y-dos-bytes";

test("la clave anónima se deriva igual que en los servicios de la base", () => {
  assert.equal(
    deriveRoleKey(ROOT, "anon"),
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjQxMDI0NDQ4MDB9.58wEo-_WCbMd1UBYc-SjtJHeka38pWuDq11UHyXAOoE",
  );
});

test("rechaza un secreto demasiado corto", () => {
  assert.throws(() => deriveRoleKey("corto", "anon"), /32 bytes/);
});
