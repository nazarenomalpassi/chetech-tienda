import path from "node:path";

const STOP_WORDS = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "el",
  "en",
  "la",
  "las",
  "lo",
  "los",
  "para",
  "por",
  "sin",
  "un",
  "una",
  "y",
  "adaptador",
  "auricular",
  "auriculares",
  "cable",
  "cargador",
  "cargadores",
  "producto",
  "productos",
  "repuesto",
  "inalambrico",
  "inalambrica",
  "bluetooth",
  "usb",
  "tipo",
  "nuevo",
  "varios",
  "uso",
  "color",
]);

const GENERIC_IMAGE_NAME = /^(img|image|dsc|photo|foto|pxl|whatsapp)[-_ ]?\d*$/i;

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function compactText(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

export function meaningfulTokens(value) {
  return [
    ...new Set(
      normalizeText(value)
        .split(" ")
        .filter((token) => {
          if (!token || STOP_WORDS.has(token)) return false;
          return token.length >= 3 || /\d/.test(token);
        }),
    ),
  ];
}

export function slugify(value, fallback = "producto") {
  const slug = normalizeText(value)
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return slug || fallback;
}

export function assertSafeArchivePath(entryPath, destinationRoot) {
  const portable = String(entryPath ?? "").replace(/\\/g, "/");
  const normalized = path.posix.normalize(portable);
  if (
    !portable ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.startsWith("/") ||
    /^[a-z]:/i.test(normalized)
  ) {
    throw new Error(`Ruta insegura dentro del ZIP: ${entryPath}`);
  }
  const root = path.resolve(destinationRoot);
  const resolved = path.resolve(root, ...normalized.split("/"));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`))
    throw new Error(`Ruta fuera del destino: ${entryPath}`);
  return resolved;
}

export function hammingDistance(left, right) {
  if (!left || !right || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1)
    if (left[index] !== right[index]) distance += 1;
  return distance;
}

export function buildProductEvidence(product) {
  const identityValues = [
    product.sku,
    product.model,
    product.board_code,
    product.part_number,
    ...(product.compatible_models ?? []),
  ]
    .map((value) => normalizeText(value))
    .filter((value) => value.length >= 3);
  const source = [
    product.name,
    product.brand,
    product.model,
    product.category_name,
    product.short_description,
    product.description,
    product.board_code,
    product.part_number,
    ...(product.compatible_models ?? []),
  ].join(" ");
  return {
    ...product,
    identityValues: [...new Set(identityValues)],
    nameTokens: meaningfulTokens(product.name),
    allTokens: meaningfulTokens(source),
    categoryTokens: meaningfulTokens(product.category_name),
  };
}

function includesPhrase(haystackCompact, value) {
  const compact = compactText(value);
  return compact.length >= 3 && haystackCompact.includes(compact);
}

export function scoreProductMatch(product, evidenceText) {
  const normalizedEvidence = normalizeText(evidenceText);
  const compactEvidence = compactText(evidenceText);
  const evidenceTokens = new Set(meaningfulTokens(evidenceText));
  const reasons = [];
  let score = 0;
  let exactIdentity = false;

  if (includesPhrase(compactEvidence, product.sku)) {
    score += 0.82;
    exactIdentity = true;
    reasons.push(`SKU visible: ${product.sku}`);
  }

  const identityMatches = product.identityValues.filter((value) =>
    includesPhrase(compactEvidence, value),
  );
  if (identityMatches.length) {
    score += Math.min(0.78, 0.64 + (identityMatches.length - 1) * 0.08);
    exactIdentity = true;
    reasons.push(`Modelo/código visible: ${identityMatches.slice(0, 3).join(", ")}`);
  }

  const matchedNameTokens = product.nameTokens.filter((token) => evidenceTokens.has(token));
  const matchedAllTokens = product.allTokens.filter((token) => evidenceTokens.has(token));
  const nameRatio = product.nameTokens.length
    ? matchedNameTokens.length / product.nameTokens.length
    : 0;
  const allRatio = product.allTokens.length
    ? matchedAllTokens.length / Math.min(product.allTokens.length, 12)
    : 0;
  const fullDistinctiveNameMatch =
    product.nameTokens.length >= 2 && matchedNameTokens.length === product.nameTokens.length;
  if (matchedNameTokens.length) {
    score += Math.min(0.5, nameRatio * 0.42 + Math.min(matchedNameTokens.length, 4) * 0.035);
    reasons.push(`Coinciden términos: ${matchedNameTokens.slice(0, 6).join(", ")}`);
  }
  if (fullDistinctiveNameMatch) {
    score += 0.32;
    reasons.push("Coinciden todos los términos distintivos del nombre");
  }
  score += Math.min(0.12, allRatio * 0.12);

  const categoryMatches = product.categoryTokens.filter((token) => evidenceTokens.has(token));
  if (categoryMatches.length) {
    score += 0.04;
    reasons.push(`Tipo compatible: ${categoryMatches.slice(0, 2).join(", ")}`);
  }

  if (!normalizedEvidence) score = 0;
  return {
    score: Math.min(1, Number(score.toFixed(4))),
    exactIdentity,
    fullDistinctiveNameMatch,
    matchedNameTokens,
    reasons,
  };
}

export function rankProductCandidates(products, evidenceText) {
  return products
    .map((product) => ({ product, ...scoreProductMatch(product, evidenceText) }))
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.product.name.localeCompare(right.product.name, "es"),
    );
}

export function confidenceForCandidates(candidates, manualOverride = false) {
  if (manualOverride) return { level: "high", score: 1, reason: "Asociación revisada manualmente" };
  const first = candidates[0];
  const second = candidates[1];
  if (!first) return { level: "low", score: 0, reason: "Sin evidencia suficiente" };
  const margin = first.score - (second?.score ?? 0);
  const strongEvidence =
    first.exactIdentity || first.fullDistinctiveNameMatch || first.matchedNameTokens.length >= 2;
  if (first.score >= 0.8 && margin >= 0.14 && strongEvidence)
    return {
      level: "high",
      score: first.score,
      reason: `Coincidencia clara; margen ${margin.toFixed(2)}`,
    };
  if (first.score >= 0.48 && margin >= 0.06)
    return {
      level: "medium",
      score: first.score,
      reason: `Coincidencia probable; margen ${margin.toFixed(2)}`,
    };
  return {
    level: "low",
    score: first.score,
    reason: margin < 0.06 ? "Existen candidatos muy parecidos" : "La evidencia es insuficiente",
  };
}

export function isGenericFilename(filename) {
  return GENERIC_IMAGE_NAME.test(path.parse(String(filename)).name);
}

export function createProposedFilename(product, sourceHash, imageIndex = 0) {
  const identity = product.model || product.brand || product.name || product.sku;
  const base = `${slugify(product.category_name, "sin-categoria")}-${slugify(identity)}-${String(product.id).slice(0, 8)}-${String(sourceHash).slice(0, 10)}`;
  return `${base}${imageIndex > 0 ? `-${imageIndex + 1}` : ""}.webp`;
}

export function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(rows, columns) {
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((column) => csvEscape(row[column])).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function qualityScore(metadata, stats) {
  const pixels = Math.max(1, Number(metadata.width ?? 0) * Number(metadata.height ?? 0));
  const resolution = Math.min(1, pixels / 8_000_000);
  const sharpness = Math.min(1, Number(stats?.sharpness ?? 0) / 8);
  const entropy = Math.min(1, Number(stats?.entropy ?? 0) / 7);
  return Number((resolution * 0.35 + sharpness * 0.4 + entropy * 0.25).toFixed(4));
}
