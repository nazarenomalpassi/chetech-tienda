import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

// Next.js 16 publica su configuración en formato plano: se usa directo, sin FlatCompat.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Leer el carrito, los datos guardados y el permiso de cookies del navegador al montar, y avanzar las
      // fases de una animación, son efectos que sincronizan con algo externo: quedan como aviso.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores(["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", ".codex-tmp/**"]),
]);
