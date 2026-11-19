import { bestSellers, isSellable, sortProducts } from "@/lib/catalog-query";
import type { Product } from "@/lib/types";

const channelRules: { match: RegExp; line: string }[] = [
  { match: /\bonn\b.*\b4k\b|\b4k\b.*\bonn\b/i, line: "Tu tele, ahora Smart" },
  { match: /\bonn\b|\btv ?stick\b/i, line: "Tu tele, ahora Smart" },
  { match: /\bcontrol remoto\b/i, line: "Perdiste el control" },
  { match: /\bcargador\b/i, line: "Carga rápida" },
  { match: /\bsoporte\b.*\btv\b/i, line: "Colgá tu tele" },
];

function lineFor(product: Product) {
  return channelRules.find((rule) => rule.match.test(product.name))?.line ?? product.familyName;
}

/** Los tres canales del televisor de la portada: los elegidos en Administración o, si no hay, ONN 4K,
 *  control remoto y el cargador más vendido. */
export function pickTvChannels(products: Product[], promoSlugs: string[]) {
  const available = products.filter((product) => isSellable(product) && product.status !== "Sin stock");
  const chosen: Product[] = [];
  for (const slug of promoSlugs) {
    const product = available.find((item) => item.slug === slug);
    if (product && !chosen.includes(product)) chosen.push(product);
  }
  if (!chosen.length) {
    for (const rule of [channelRules[0], channelRules[2], channelRules[3]]) {
      const product = sortProducts(available.filter((item) => rule.match.test(item.name)), "popular")[0];
      if (product && !chosen.includes(product)) chosen.push(product);
    }
  }
  for (const product of bestSellers(available, 6)) {
    if (chosen.length >= 3) break;
    if (!chosen.includes(product)) chosen.push(product);
  }
  return chosen.slice(0, 3).map((product) => ({ product, line: lineFor(product) }));
}

/** Para la pared de familias: cantidad y hasta tres fotos de lo más vendido de cada una. */
export function familySummaries(products: Product[]) {
  const map = new Map<string, { count: number; images: string[] }>();
  for (const product of sortProducts(products.filter(isSellable), "popular")) {
    const entry = map.get(product.family) ?? { count: 0, images: [] };
    entry.count += 1;
    if (product.image && entry.images.length < 3) entry.images.push(product.image);
    map.set(product.family, entry);
  }
  return map;
}
