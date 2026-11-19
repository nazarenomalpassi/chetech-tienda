#!/usr/bin/env node
// Borra de src/styles/legacy.css las reglas cuyas clases ya no usa ningún archivo de src/.
// Uso: node scripts/prune-legacy-css.mjs [--write]
// Sin --write solo informa. Una regla se conserva si al menos una de sus clases aparece en el código,
// si no tiene clases (selectores de elementos) o si su clase coincide con un prefijo dinámico.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import postcss from "postcss";

const ROOT = new URL("..", import.meta.url).pathname;
const CSS_PATH = join(ROOT, "src/styles/legacy.css");
// Clases que se arman con plantillas (`status-${estado}`) o que agrega una librería.
const DYNAMIC_PREFIXES = ["status-", "is-", "has-", "service-tech-accordion--"];

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx", ".js", ".mjs"].includes(extname(path)) ? [path] : [];
  });
}

const code = sourceFiles(join(ROOT, "src"))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
const words = new Set(code.match(/[A-Za-z0-9_-]+/g));

const used = (className) =>
  words.has(className) || DYNAMIC_PREFIXES.some((prefix) => className.startsWith(prefix));

const classesIn = (selector) => [...selector.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((match) => match[1]);

const css = readFileSync(CSS_PATH, "utf8");
const root = postcss.parse(css);
let removed = 0;
let kept = 0;

root.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes/i.test(rule.parent.name)) return;
  const selectors = rule.selectors.filter((selector) => {
    const classes = classesIn(selector);
    if (!classes.length) return true;
    return classes.every(used);
  });
  if (!selectors.length) {
    rule.remove();
    removed += 1;
  } else {
    if (selectors.length !== rule.selectors.length) rule.selectors = selectors;
    kept += 1;
  }
});

// Bloques @media que quedaron vacíos.
root.walkAtRules((atRule) => {
  if (atRule.nodes && atRule.nodes.length === 0) atRule.remove();
});

const output = root.toString();
console.log(`Reglas borradas: ${removed}. Reglas que siguen en uso: ${kept}.`);
console.log(`Tamaño: ${(css.length / 1024).toFixed(1)} KB → ${(output.length / 1024).toFixed(1)} KB`);
if (process.argv.includes("--write")) {
  writeFileSync(CSS_PATH, output);
  console.log("legacy.css actualizado.");
}
