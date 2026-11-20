// Lista de aviso: decide qué producto publicado responde a cada pedido de aviso. Sin dependencias del
// servidor, para poder probarlo.
import type { Product } from "@/lib/types";

export type WaitlistKind = "product" | "refurbished" | "board";

export type WaitlistEntry = {
  id: string;
  kind: WaitlistKind;
  storefront_product_id: string | null;
  query: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  notified_at: string | null;
};

const inStock = (product: Product) =>
  Boolean(product.image) &&
  product.price > 0 &&
  (product.status === "Disponible" || product.status === "Últimas unidades");

/** Letras y números, sin acentos, espacios ni guiones: "32 LB-561b" y "32lb561B" son el mismo modelo. */
export function modelKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

function boardKeys(product: Product) {
  if (!product.board) return [];
  return [
    product.board.code,
    product.board.partNumber ?? "",
    ...product.board.compatibleModels,
    product.model,
  ]
    .map(modelKey)
    .filter((key) => key.length >= 4);
}

/**
 * El producto en stock que responde al pedido de aviso, o null si todavía no hay.
 * - product: ese mismo producto volvió a tener stock.
 * - refurbished: entró cualquier equipo reacondicionado por el taller.
 * - board: hay una placa cuyo código o modelo compatible coincide con lo que escribió el cliente. La
 *   coincidencia es estricta a propósito: avisar una placa equivocada es peor que no avisar.
 */
export function waitlistMatch(
  entry: Pick<WaitlistEntry, "kind" | "storefront_product_id" | "query">,
  products: Product[],
) {
  if (entry.kind === "product") {
    const product = products.find((item) => item.id === entry.storefront_product_id);
    return product && inStock(product) ? product : null;
  }
  if (entry.kind === "refurbished") {
    return (
      products.find(
        (item) => item.condition === "Reacondicionado" && !item.board && inStock(item),
      ) ?? null
    );
  }
  const wanted = modelKey(entry.query ?? "");
  if (wanted.length < 4) return null;
  return (
    products.find(
      (item) =>
        inStock(item) &&
        boardKeys(item).some(
          (key) => key === wanted || (wanted.length >= 6 && key.includes(wanted)),
        ),
    ) ?? null
  );
}

/** Si a este pedido la tienda le puede avisar sola por mail, sin que una persona lo revise. */
export function canAutoNotify(entry: Pick<WaitlistEntry, "kind" | "query" | "email">) {
  // Quien escribió qué tele busca ("de 43 pulgadas") espera esa, no cualquiera: lo decide una persona.
  return Boolean(entry.email) && !(entry.kind === "refurbished" && entry.query?.trim());
}

/**
 * El producto para el mail automático, que sale sin que nadie lo mire. Es más exigente que
 * waitlistMatch: las teles revisadas y las placas tienen que haberse publicado después del pedido de
 * aviso. Así no le llega "ya entró" a quien se anotó con esa misma publicación a la vista porque no le
 * servía. Lo que queda afuera se ve igual en Administración, para escribirle a mano.
 */
export function waitlistAutoMatch(
  entry: Pick<WaitlistEntry, "kind" | "storefront_product_id" | "query" | "email" | "created_at">,
  products: Product[],
) {
  if (!canAutoNotify(entry)) return null;
  if (entry.kind === "product") return waitlistMatch(entry, products);
  const since = Date.parse(entry.created_at);
  if (!Number.isFinite(since)) return null;
  return waitlistMatch(
    entry,
    products.filter((item) => Date.parse(item.publishedAt ?? "") > since),
  );
}

/** Qué pidió, en palabras: para la lista de Administración y para los mails. */
export function waitlistSubject(
  entry: Pick<WaitlistEntry, "kind" | "storefront_product_id" | "query">,
  products: Product[],
) {
  if (entry.kind === "product") {
    return (
      products.find((item) => item.id === entry.storefront_product_id)?.name ??
      "Un producto que ya no está publicado"
    );
  }
  if (entry.kind === "refurbished")
    return entry.query ? `Tele revisada: ${entry.query}` : "Una tele revisada por el taller";
  return entry.query ? `Placa para ${entry.query}` : "Una placa de TV";
}
