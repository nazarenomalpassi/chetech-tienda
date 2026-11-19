// Sugerencias para clientes del taller: quien arregla una tele suele necesitar control, soporte o cable.
import { isSellable, normalizeText } from "@/lib/catalog-query";
import type { Product } from "@/lib/types";

export function isTelevision(deviceType: string) {
  return /\b(tv|tele|televisor|television|smart|led|lcd|oled|qled)\b/.test(normalizeText(deviceType));
}

const picks: RegExp[] = [/\bcontrol\b/, /\bsoporte\b/, /\bhdmi\b/, /\b(onn|tv stick|tv box)\b/];

/** Hasta cuatro productos de "Para tu tele": un control, un soporte, un HDMI y un equipo para hacerla Smart. */
export function tvCompanions(products: Product[], limit = 4): Product[] {
  const pool = products
    .filter((product) => product.family === "para-tu-tele" && isSellable(product) && product.status !== "Sin stock" && product.price > 0)
    .sort((a, b) => (a.popularityRank ?? 9999) - (b.popularityRank ?? 9999));
  const chosen: Product[] = [];
  for (const pattern of picks) {
    const match = pool.find((product) => !chosen.includes(product) && pattern.test(normalizeText(product.name)));
    if (match) chosen.push(match);
  }
  for (const product of pool) {
    if (chosen.length >= limit) break;
    if (!chosen.includes(product)) chosen.push(product);
  }
  return chosen.slice(0, limit);
}
