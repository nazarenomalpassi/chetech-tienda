// Filtros, búsqueda y orden del catálogo en memoria. El catálogo completo pesa poco (menos de
// 300 productos), así que se trae una vez, se cachea y se filtra acá: más rápido y fácil de probar.
import {
  compatFilters,
  families as familyMeta,
  needBySlug,
  PAGE_SIZE,
  priceRanges,
  searchSynonyms,
} from "@/config/catalog";
import type { CatalogQuery, CatalogResult, CatalogSort, Product } from "@/lib/types";

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshteinWithin(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return false;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    let rowMin = previous[0];
    for (let j = 1; j <= b.length; j += 1) {
      const temp = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = temp;
      rowMin = Math.min(rowMin, previous[j]);
    }
    if (rowMin > max) return false;
  }
  return previous[b.length] <= max;
}

export function productHaystack(product: Product) {
  return normalizeText(
    [
      product.name,
      product.brand,
      product.model,
      product.category,
      product.familyName,
      product.sku,
      product.board?.code ?? "",
      product.board?.partNumber ?? "",
      ...(product.board?.compatibleModels ?? []),
      ...product.compatibleWith,
    ].join(" "),
  );
}

/**
 * Puntaje de búsqueda: cada palabra buscada tiene que aparecer (o un sinónimo, o una palabra
 * parecida con un error de tipeo). Devuelve 0 si no coincide.
 */
export function searchScore(product: Product, query: string) {
  const terms = normalizeText(query).split(" ").filter(Boolean);
  if (!terms.length) return 1;
  const haystack = productHaystack(product);
  const words = haystack.split(" ");
  const name = normalizeText(product.name);
  let score = 0;

  for (const term of terms) {
    const alternatives = [term, ...(searchSynonyms[term] ?? []).map(normalizeText)];
    let best = 0;
    for (const alternative of alternatives) {
      if (!alternative) continue;
      if (name.startsWith(alternative)) best = Math.max(best, 6);
      else if (` ${name} `.includes(` ${alternative} `)) best = Math.max(best, 5);
      else if (haystack.includes(alternative)) best = Math.max(best, alternative === term ? 4 : 3);
      else if (
        alternative.length >= 4 &&
        words.some((word) => word.length >= 3 && levenshteinWithin(word, alternative, alternative.length >= 7 ? 2 : 1))
      )
        best = Math.max(best, 2);
    }
    if (best === 0) return 0;
    score += best;
  }
  return score;
}

export function matchesCompat(product: Product, slug: string) {
  const filter = compatFilters.find((item) => item.slug === slug);
  if (!filter) return true;
  return filter.match.test(`${product.name} ${product.compatibleWith.join(" ")} ${product.category}`);
}

export function matchesNeed(product: Product, slug: string) {
  const need = needBySlug.get(slug);
  if (!need) return true;
  return need.match.test(`${product.name} ${product.category}`);
}

const statusWeight: Record<string, number> = {
  Disponible: 0,
  "Últimas unidades": 0,
  "Consultar disponibilidad": 1,
  "Sin stock": 2,
};

export function sortProducts(products: Product[], sort: CatalogSort, scores?: Map<string, number>) {
  const sorted = [...products];
  sorted.sort((a, b) => {
    const stock = (statusWeight[a.status] ?? 1) - (statusWeight[b.status] ?? 1);
    if (stock !== 0) return stock;
    if (scores) {
      const relevance = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
      if (relevance !== 0 && sort === "popular") return relevance;
    }
    switch (sort) {
      case "price-asc":
        return a.price - b.price || a.name.localeCompare(b.name, "es");
      case "price-desc":
        return b.price - a.price || a.name.localeCompare(b.name, "es");
      case "name":
        return a.name.localeCompare(b.name, "es");
      case "recent":
        return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.name.localeCompare(b.name, "es");
      case "popular":
      default: {
        const rankA = a.popularityRank ?? Number.POSITIVE_INFINITY;
        const rankB = b.popularityRank ?? Number.POSITIVE_INFINITY;
        if (rankA !== rankB) return rankA - rankB;
        if (Boolean(b.isOffer) !== Boolean(a.isOffer)) return b.isOffer ? 1 : -1;
        if (Boolean(b.featured) !== Boolean(a.featured)) return b.featured ? 1 : -1;
        return a.name.localeCompare(b.name, "es");
      }
    }
  });
  return sorted;
}

export function isSellable(product: Product) {
  return Boolean(product.image) && product.price > 0;
}

export function queryCatalog(all: Product[], query: CatalogQuery = {}): CatalogResult {
  const pageSize = Math.min(Math.max(Math.trunc(query.pageSize ?? PAGE_SIZE), 1), 48);
  const sort: CatalogSort = query.sort ?? "popular";
  const search = query.search?.trim().slice(0, 100) ?? "";
  const range = priceRanges.find((item) => item.slug === query.priceRange);

  // Regla del plan: un producto sin foto no se publica en el catálogo.
  const withPhoto = all.filter(isSellable);
  const hiddenWithoutPhoto = all.length - withPhoto.length;

  const scores = new Map<string, number>();
  const base = withPhoto.filter((product) => {
    if (search) {
      const score = searchScore(product, search);
      if (!score) return false;
      scores.set(product.id, score);
    }
    if (query.need && !matchesNeed(product, query.need)) return false;
    if (query.compat && !matchesCompat(product, query.compat)) return false;
    if (range && (product.price < range.min || product.price >= range.max)) return false;
    if (query.condition && product.condition !== query.condition) return false;
    if (query.categorySlug && product.categorySlug !== query.categorySlug) return false;
    return true;
  });

  const familyCounts = new Map<string, number>();
  for (const product of base) familyCounts.set(product.family, (familyCounts.get(product.family) ?? 0) + 1);

  const filtered = query.family ? base.filter((product) => product.family === query.family) : base;

  const categoryCounts = new Map<string, { name: string; count: number }>();
  const conditionCounts = new Map<string, number>();
  for (const product of filtered) {
    const current = categoryCounts.get(product.categorySlug);
    categoryCounts.set(product.categorySlug, {
      name: product.category,
      count: (current?.count ?? 0) + 1,
    });
    conditionCounts.set(product.condition, (conditionCounts.get(product.condition) ?? 0) + 1);
  }

  const sorted = sortProducts(filtered, sort, search ? scores : undefined);
  const total = sorted.length;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const page = Math.min(Math.max(Math.trunc(query.page ?? 1), 1), totalPages);

  return {
    products: sorted.slice((page - 1) * pageSize, page * pageSize),
    families: familyMeta
      .map((family) => ({ slug: family.slug, name: family.name, count: familyCounts.get(family.slug) ?? 0 }))
      .concat(
        familyCounts.get("otros")
          ? [{ slug: "otros", name: "Otros", count: familyCounts.get("otros") ?? 0 }]
          : [],
      ),
    categories: [...categoryCounts.entries()]
      .map(([slug, value]) => ({ slug, name: value.name, count: value.count }))
      .sort((a, b) => b.count - a.count),
    conditions: [...conditionCounts.entries()].map(([value, count]) => ({
      value: value as Product["condition"],
      count,
    })),
    total,
    page,
    pageSize,
    totalPages,
    hiddenWithoutPhoto,
  };
}

/** Los más vendidos del local, con foto y stock. */
export function bestSellers(all: Product[], limit = 8) {
  return sortProducts(
    all.filter((product) => isSellable(product) && product.status !== "Sin stock"),
    "popular",
  ).slice(0, limit);
}

/** Complementos reales para la ficha: para la tele, HDMI y pilas; si no, la misma familia. */
export function complementsFor(product: Product, all: Product[], limit = 4) {
  const pool = all.filter(
    (item) => item.id !== product.id && isSellable(item) && item.status !== "Sin stock",
  );
  const picks: Product[] = [];
  const take = (predicate: (item: Product) => boolean) => {
    for (const item of sortProducts(pool.filter(predicate), "popular")) {
      if (picks.length >= limit) return;
      if (!picks.some((pick) => pick.id === item.id)) picks.push(item);
    }
  };
  const text = `${product.name} ${product.category}`;
  if (/\b(onn|tv ?stick|soporte|televisor|tv)\b/i.test(text)) {
    take((item) => /\bhdmi\b/i.test(item.name));
    take((item) => /\b(aaa|pila)\b/i.test(item.name));
    take((item) => /\b(soporte|control)\b/i.test(item.name) && !/\bauto\b/i.test(item.name));
  }
  if (/\b(cargador|fuente)\b/i.test(text)) {
    take((item) => /\bcable\b/i.test(item.name) && matchesSameConnector(product, item));
  }
  if (/\bcable\b/i.test(text)) {
    take((item) => /\b(cargador|fuente)\b/i.test(item.name) && matchesSameConnector(product, item));
  }
  if (/\b(control|joystick)\b/i.test(text)) take((item) => /\b(aaa|aa|pila)\b/i.test(item.name));
  take((item) => item.family === product.family);
  return picks.slice(0, limit);
}

function matchesSameConnector(a: Product, b: Product) {
  const connectors = compatFilters.filter((filter) => filter.slug !== "hdmi" && filter.slug !== "bluetooth");
  const aMatches = connectors.filter((filter) => filter.match.test(a.name)).map((filter) => filter.slug);
  if (!aMatches.length) return true;
  return connectors.some((filter) => aMatches.includes(filter.slug) && filter.match.test(b.name));
}
