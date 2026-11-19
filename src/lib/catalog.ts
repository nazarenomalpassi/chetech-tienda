import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { familyBySlug } from "@/config/catalog";
import { bestSellers, complementsFor, queryCatalog } from "@/lib/catalog-query";
import type { CatalogQuery, CatalogResult, Product } from "@/lib/types";

export { normalizeSearch } from "@/lib/search";

export const STOREFRONT_CATALOG_TAG = "storefront-catalog";

const CACHE_SECONDS = 60;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createStorefrontClient() {
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function warrantyText(months: number) {
  if (months <= 0) return "Sin garantía";
  return `Garantía de ${months} ${months === 1 ? "mes" : "meses"}`;
}

const knownStatuses = ["Disponible", "Últimas unidades", "Sin stock", "Consultar disponibilidad"];

export function mapProduct(row: Record<string, unknown>): Product {
  const specs =
    typeof row.specifications === "object" && row.specifications && !Array.isArray(row.specifications)
      ? Object.fromEntries(
          Object.entries(row.specifications as Record<string, unknown>)
            .filter(([, value]) => value !== null && value !== "")
            .map(([name, value]) => [name, String(value)]),
        )
      : {};
  const primaryImage = row.primary_image_url ? String(row.primary_image_url) : "";
  const galleryImages = Array.isArray(row.image_urls) ? row.image_urls.map(String).filter(Boolean) : [];
  const images = [...new Set([primaryImage, ...galleryImages].filter(Boolean))];
  const condition = String(row.condition ?? "Nuevo") as Product["condition"];
  const familySlug = String(row.family_slug ?? "otros");
  const warrantyMonths = Number.isFinite(Number(row.warranty_months))
    ? Number(row.warranty_months)
    : condition === "Nuevo"
      ? 6
      : 3;
  const status = String(row.availability_label ?? "Consultar disponibilidad");

  return {
    id: String(row.id),
    slug: String(row.slug),
    sku: String(row.sku),
    name: String(row.name),
    shortDescription: String(row.short_description ?? ""),
    description: String(row.description ?? ""),
    category: String(row.category_name ?? "Sin categoría"),
    categorySlug: String(row.category_slug ?? "sin-categoria"),
    family: familySlug,
    familyName: String(row.family_name ?? familyBySlug.get(familySlug)?.name ?? "Otros"),
    brand: String(row.brand ?? ""),
    model: String(row.model ?? ""),
    price: Number(row.public_price ?? 0),
    previousPrice: row.previous_price ? Number(row.previous_price) : undefined,
    condition,
    status: (knownStatuses.includes(status) ? status : "Consultar disponibilidad") as Product["status"],
    image: images[0],
    images,
    featured: Boolean(row.is_featured),
    isNewArrival: Boolean(row.is_new),
    isOffer: Boolean(row.is_offer),
    shipping: row.shipping_enabled === undefined ? true : Boolean(row.shipping_enabled),
    pickup: row.pickup_enabled === undefined ? true : Boolean(row.pickup_enabled),
    warranty: warrantyText(warrantyMonths),
    warrantyMonths,
    warrantyIsLegalMinimum: row.warranty_is_legal_minimum === undefined ? true : Boolean(row.warranty_is_legal_minimum),
    shippingSize: row.shipping_size ? (String(row.shipping_size) as Product["shippingSize"]) : undefined,
    videoUrl: row.video_url ? String(row.video_url) : undefined,
    boxContents: row.box_contents ? String(row.box_contents) : undefined,
    compatibleWith: Array.isArray(row.compatible_with) ? row.compatible_with.map(String) : [],
    popularityRank: row.popularity_rank ? Number(row.popularity_rank) : undefined,
    publishedAt: row.published_at ? String(row.published_at) : undefined,
    specifications: specs,
    board: row.board_code
      ? {
          code: String(row.board_code),
          partNumber: row.part_number ? String(row.part_number) : undefined,
          type: String(row.board_type ?? "Placa"),
          compatibleModels: Array.isArray(row.compatible_models) ? row.compatible_models.map(String) : [],
        }
      : undefined,
  };
}

async function fetchAllProducts(): Promise<Product[]> {
  const supabase = createStorefrontClient();
  if (!supabase) return [];

  const v3 = await supabase.rpc("get_storefront_products_v3");
  if (!v3.error && Array.isArray(v3.data)) {
    return v3.data.map((row) => mapProduct(row as Record<string, unknown>));
  }

  // Si la base todavía no tiene la versión 3, se usa la anterior para que la tienda no se caiga.
  const legacy = await supabase.rpc("get_storefront_products", { p_ids: null, p_slugs: null });
  if (legacy.error) {
    console.error("Catálogo no disponible", legacy.error.code);
    throw new Error(`Catálogo no disponible: ${legacy.error.code ?? "desconocido"}`);
  }
  return Array.isArray(legacy.data)
    ? legacy.data.map((row) => mapProduct(row as Record<string, unknown>))
    : [];
}

const fetchAllProductsCached = unstable_cache(fetchAllProducts, ["storefront-products-v3"], {
  revalidate: CACHE_SECONDS,
  tags: [STOREFRONT_CATALOG_TAG],
});
const fetchAllProductsForRequest = cache(fetchAllProductsCached);

/** Todo el catálogo publicable (con y sin foto). */
export async function getProducts(): Promise<Product[]> {
  try {
    return await fetchAllProductsForRequest();
  } catch {
    return [];
  }
}

export async function getCatalog(query: CatalogQuery = {}): Promise<CatalogResult> {
  return queryCatalog(await getProducts(), query);
}

export async function getProduct(slug: string): Promise<Product | undefined> {
  const normalized = slug.trim().slice(0, 180);
  if (!normalized) return undefined;
  return (await getProducts()).find((product) => product.slug === normalized);
}

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  const wanted = new Set(ids);
  return (await getProducts()).filter((product) => wanted.has(product.id));
}

export async function getRelatedProducts(product: Product, max = 4): Promise<Product[]> {
  return complementsFor(product, await getProducts(), max);
}

export async function getBestSellers(limit = 8): Promise<Product[]> {
  return bestSellers(await getProducts(), limit);
}

export async function getBoardProducts(): Promise<Product[]> {
  return (await getProducts()).filter((product) => Boolean(product.board) || product.family === "del-taller" && /placa/i.test(product.name));
}

export async function getRefurbishedProducts(): Promise<Product[]> {
  return (await getProducts()).filter((product) => product.condition === "Reacondicionado");
}
