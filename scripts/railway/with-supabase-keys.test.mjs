import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveCheckoutAccessSecret,
  deriveLegalRequestSalt,
  deriveRoleKey,
} from "./with-supabase-keys.mjs";

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
  assert.throws(() => deriveLegalRequestSalt("corto"), /32 bytes/);
});

// Mismo cálculo que hace la base con pgcrypto:
// encode(extensions.hmac('chetech/legal-request-salt/v1', <ROOT_SECRET>, 'sha256'), 'hex')
// (valor comprobado contra pgcrypto en Postgres 17).
test("la clave de solicitudes legales coincide con la que calcula la base", () => {
  assert.equal(
    deriveLegalRequestSalt(ROOT),
    "5f6a78b1ea8bf2b9626ea35d4ce08b2a9063ff91fb24347ef20c78a31d6c60ce",
  );
});

test("el secreto de los enlaces de pedidos es estable y distinto de la clave legal", () => {
  const secret = deriveCheckoutAccessSecret(ROOT);
  assert.match(secret, /^[0-9a-f]{64}$/);
  assert.equal(secret, deriveCheckoutAccessSecret(ROOT));
  assert.notEqual(secret, deriveLegalRequestSalt(ROOT));
  assert.throws(() => deriveCheckoutAccessSecret("corto"), /32 bytes/);
});
