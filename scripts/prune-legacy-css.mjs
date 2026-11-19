#!/usr/bin/env node
// Borra de src/styles/legacy/*.css las reglas que ya no usa ninguna pantalla de su zona.
// Uso: node scripts/prune-legacy-css.mjs [--write]
//
// Cada archivo se carga solo en su zona y se compara con el código de esa zona:
//   admin.css    src/app/admin/**, src/components/admin-*
//   service.css  src/app/servicio-tecnico/**, src/components/service-*
//   repair.css   src/app/cuenta/reparaciones/**, src/components/repair-*
// Una regla se conserva si todas las clases que necesita alguno de sus selectores aparecen en textos
// del código de la zona, si no tiene clases (html, :root…) o si su clase coincide con un prefijo
// dinámico.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import postcss from "postcss";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
// Clases que se arman con plantillas (`status-${estado}`).
const DYNAMIC_PREFIXES = ["status-", "is-", "has-", "service-tech-accordion--"];
const ZONES = {
  admin: (path) => path.startsWith("app/admin/") || path.startsWith("components/admin-") || path === "app/admin-actions.ts",
  service: (path) => path.startsWith("app/servicio-tecnico/") || path.startsWith("components/service-"),
  repair: (path) => path.startsWith("app/cuenta/reparaciones/") || path.startsWith("components/repair-"),
};

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(path)) ? [path] : [];
  });
}

// Las clases viven en textos: "a b", 'a', `a ${b}`. Las rutas de importación no cuentan.
function stringTokens(code) {
  const tokens = new Set();
  const literal = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  for (const match of code.matchAll(literal)) {
    const text = (match[1] ?? match[2] ?? match[3] ?? "").replace(/\$\{[^}]*\}/g, " ");
    if (/^[@./]/.test(text.trim()) || text.includes("://")) continue;
    for (const word of text.match(/[A-Za-z_][A-Za-z0-9_-]*/g) ?? []) tokens.add(word);
  }
  return tokens;
}

const classesIn = (selector) => [...selector.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((match) => match[1]);

// Grupos de clases que tiene que haber en la página para que el selector aplique. Lo que está dentro
// de :not() no hace falta; :where() e :is() son alternativas (alcanza con una).
function requiredClassSets(selector) {
  const withoutNot = selector.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, "");
  const group = withoutNot.match(/:(?:where|is)\(([^()]*)\)/);
  if (!group) return [classesIn(withoutNot)];
  return group[1].split(",").flatMap((alternative) => requiredClassSets(withoutNot.replace(group[0], alternative.trim())));
}

const applies = (selector, used) => requiredClassSets(selector).some((classes) => classes.every(used));
const files = sourceFiles(SRC).map((file) => ({ path: relative(SRC, file), code: readFileSync(file, "utf8") }));

for (const [zone, belongs] of Object.entries(ZONES)) {
  const cssPath = join(SRC, "styles/legacy", `${zone}.css`);
  const zoneFiles = files.filter((file) => belongs(file.path));
  const words = new Set(zoneFiles.flatMap((file) => [...stringTokens(file.code)]));
  const prefixes = DYNAMIC_PREFIXES.filter((prefix) => zoneFiles.some((file) => file.code.includes(prefix)));
  const used = (name) => words.has(name) || prefixes.some((prefix) => name.startsWith(prefix));

  const css = readFileSync(cssPath, "utf8");
  const root = postcss.parse(css);
  let removed = 0;
  root.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes/i.test(rule.parent.name)) return;
    const selectors = rule.selectors.filter((selector) => applies(selector, used));
    if (!selectors.length) {
      rule.remove();
      removed += 1;
    } else if (selectors.length !== rule.selectors.length) {
      rule.selectors = selectors;
    }
  });
  root.walkAtRules((atRule) => {
    if (atRule.nodes && atRule.nodes.length === 0) atRule.remove();
  });
  const output = root.toString();
  console.log(`${zone}.css: ${removed} reglas sin uso, ${(css.length / 1024).toFixed(1)} KB → ${(output.length / 1024).toFixed(1)} KB`);
  if (process.argv.includes("--write") && removed) writeFileSync(cssPath, output);
}
