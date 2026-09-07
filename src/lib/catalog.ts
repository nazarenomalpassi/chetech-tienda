import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { siteConfig } from "@/config/site";
import type {
  CatalogQuery,
  CatalogResult,
  CatalogSort,
  Product,
  ProductCondition,
} from "@/lib/types";

export { normalizeSearch } from "@/lib/search";

export const STOREFRONT_CATALOG_TAG = "storefront-catalog";

const CACHE_SECONDS = 60;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createStorefrontClient() {
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function reportStorefrontError(message: string, error: { code?: string }): never {
  console.error(message, error.code);
  throw new Error(`${message}: ${error.code ?? "unknown"}`);
}

function emptyCatalog(page: number, pageSize: number): CatalogResult {
  return {
    products: [],
    categories: [],
    conditions: [],
    total: 0,
    page,
    pageSize,
    totalPages: 0,
  };
}

function normalizePositiveInteger(value: number | undefined, fallback: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value as number), 1), maximum);
}

function normalizeOptionalValue(value: string | undefined, maximum: number) {
  const normalized = value?.trim().slice(0, maximum);
  return normalized || null;
}

function normalizeCondition(value: ProductCondition | undefined): ProductCondition | null {
  return value && ["Nuevo", "Reacondicionado", "Usado"].includes(value) ? value : null;
}

function normalizeSort(value: CatalogSort | undefined): CatalogSort {
  return value && ["recent", "price-asc", "price-desc", "name"].includes(value) ? value : "recent";
}

export function mapProduct(row: Record<string, unknown>): Product {
  const specs =
    typeof row.specifications === "object" && row.specifications
      ? (row.specifications as Record<string, string>)
      : {};
  const primaryImage = row.primary_image_url ? String(row.primary_image_url) : "";
  const galleryImages = Array.isArray(row.image_urls)
    ? row.image_urls.map(String).filter(Boolean)
    : [];
  const images = [...new Set([primaryImage, ...galleryImages].filter(Boolean))];

  return {
    id: String(row.id),
    slug: String(row.slug),
    sku: String(row.sku),
    name: String(row.name),
    shortDescription: String(row.short_description ?? ""),
    description: String(row.description ?? ""),
    category: String(row.category_name ?? "Sin categoría"),
    categorySlug: String(row.category_slug ?? "sin-categoria"),
    brand: String(row.brand ?? ""),
    model: String(row.model ?? ""),
    price: Number(row.public_price ?? 0),
    previousPrice: row.previous_price ? Number(row.previous_price) : undefined,
    condition: String(row.condition ?? "Nuevo") as Product["condition"],
    status: String(row.availability_label ?? "Consultar disponibilidad") as Product["status"],
    image: images[0],
    images,
    featured: Boolean(row.is_featured),
    isNewArrival: Boolean(row.is_new),
    isOffer: Boolean(row.is_offer),
    shipping: Boolean(row.shipping_enabled),
    pickup: Boolean(row.pickup_enabled),
    warranty: String(row.warranty ?? siteConfig.warrantyText),
    specifications: specs,
    board: row.board_code
      ? {
          code: String(row.board_code),
          partNumber: row.part_number ? String(row.part_number) : undefined,
          type: String(row.board_type ?? "Placa"),
          compatibleModels: Array.isArray(row.compatible_models)
            ? row.compatible_models.map(String)
            : [],
        }
      : undefined,
  };
}

async function fetchProducts(): Promise<Product[]> {
  const supabase = createStorefrontClient();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc("get_storefront_products", {
    p_ids: null,
    p_slugs: null,
  });

  if (error) reportStorefrontError("Storefront catalog unavailable", error);

  return Array.isArray(data) ? data.map((row) => mapProduct(row as Record<string, unknown>)) : [];
}

const fetchProductsCached = unstable_cache(fetchProducts, ["storefront-products-v2"], {
  revalidate: CACHE_SECONDS,
  tags: [STOREFRONT_CATALOG_TAG],
});
const fetchProductsForRequest = cache(fetchProductsCached);

export async function getProducts(): Promise<Product[]> {
  try {
    return await fetchProductsForRequest();
  } catch {
    return [];
  }
}

type SpecialCatalog = "boards" | "refurbished";

async function fetchSpecialProducts(kind: SpecialCatalog): Promise<Product[]> {
  const supabase = createStorefrontClient();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc("get_storefront_special_products", {
    p_kind: kind,
  });
  if (error) reportStorefrontError(`Storefront ${kind} catalog unavailable`, error);

  return (Array.isArray(data) ? data : []).map((row) => mapProduct(row as Record<string, unknown>));
}

const fetchSpecialProductsCached = unstable_cache(
  fetchSpecialProducts,
  ["storefront-special-products-v1"],
  { revalidate: CACHE_SECONDS, tags: [STOREFRONT_CATALOG_TAG] },
);

export async function getBoardProducts(): Promise<Product[]> {
  try {
    return await fetchSpecialProductsCached("boards");
  } catch {
    return [];
  }
}

export async function getRefurbishedProducts(): Promise<Product[]> {
  try {
    return await fetchSpecialProductsCached("refurbished");
  } catch {
    return [];
  }
}

async function fetchCatalog(
  categorySlug: string | null,
  condition: ProductCondition | null,
  search: string | null,
  sort: CatalogSort,
  page: number,
  pageSize: number,
): Promise<CatalogResult> {
  const fallback = emptyCatalog(page, pageSize);
  const supabase = createStorefrontClient();
  if (!supabase) return fallback;

  const { data, error } = await supabase.rpc("get_storefront_catalog", {
    p_category_slug: categorySlug,
    p_condition: condition,
    p_search: search,
    p_sort: sort,
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) reportStorefrontError("Storefront catalog filters unavailable", error);

  const payload =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const products = Array.isArray(payload.products)
    ? payload.products.map((row) => mapProduct(row as Record<string, unknown>))
    : [];
  const categories = Array.isArray(payload.categories)
    ? payload.categories.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        const name = String(row.name ?? "").trim();
        const slug = String(row.slug ?? "").trim();
        if (!name || !slug) return [];
        return [{ name, slug, count: Number(row.count ?? 0) }];
      })
    : [];
  const conditions = Array.isArray(payload.conditions)
    ? payload.conditions.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        const value = String(row.value ?? "") as ProductCondition;
        if (!["Nuevo", "Reacondicionado", "Usado"].includes(value)) return [];
        return [{ value, count: Number(row.count ?? 0) }];
      })
    : [];

  return {
    products,
    categories,
    conditions,
    total: Number(payload.total ?? 0),
    page: Number(payload.page ?? page),
    pageSize: Number(payload.pageSize ?? pageSize),
    totalPages: Number(payload.totalPages ?? 0),
  };
}

const fetchCatalogCached = unstable_cache(fetchCatalog, ["storefront-catalog-v2"], {
  revalidate: CACHE_SECONDS,
  tags: [STOREFRONT_CATALOG_TAG],
});
const fetchCatalogForRequest = cache(fetchCatalogCached);

export async function getCatalog(query: CatalogQuery = {}): Promise<CatalogResult> {
  const page = normalizePositiveInteger(query.page, 1, 10_000);
  const pageSize = normalizePositiveInteger(query.pageSize, 24, 48);
  const fallback = emptyCatalog(page, pageSize);

  try {
    return await fetchCatalogForRequest(
      normalizeOptionalValue(query.categorySlug, 120),
      normalizeCondition(query.condition),
      normalizeOptionalValue(query.search, 100),
      normalizeSort(query.sort),
      page,
      pageSize,
    );
  } catch {
    return fallback;
  }
}

function stableProductScore(product: Product, seed: string) {
  const value = `${seed}:${product.id}:${product.categorySlug}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function interleaveCategories(products: Product[], seed: string) {
  const buckets = new Map<string, Product[]>();
  products.forEach((product) => {
    const key = product.categorySlug || product.category;
    const bucket = buckets.get(key) ?? [];
    bucket.push(product);
    buckets.set(key, bucket);
  });

  const orderedBuckets = [...buckets.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([, items]) =>
      items.sort(
        (first, second) =>
          stableProductScore(first, seed) - stableProductScore(second, seed) ||
          first.name.localeCompare(second.name, "es"),
      ),
    );
  const offset = orderedBuckets.length
    ? stableProductScore(products[0], seed) % orderedBuckets.length
    : 0;
  const rotated = [...orderedBuckets.slice(offset), ...orderedBuckets.slice(0, offset)];
  const result: Product[] = [];
  let row = 0;

  while (rotated.some((bucket) => row < bucket.length)) {
    rotated.forEach((bucket) => {
      if (bucket[row]) result.push(bucket[row]);
    });
    row += 1;
  }

  return result;
}

export function selectHomeProducts(
  products: Product[],
  max = 12,
  seed = new Date().toISOString().slice(0, 10),
) {
  const safeMax = Math.min(Math.max(Math.trunc(max), 1), 16);
  const available = products.filter((product) => product.status !== "Sin stock");
  const featured = interleaveCategories(
    available.filter((product) => product.featured),
    `${seed}:featured`,
  );
  const regular = interleaveCategories(
    available.filter((product) => !product.featured),
    `${seed}:regular`,
  );

  return [...featured, ...regular].slice(0, safeMax);
}

async function fetchProduct(slug: string): Promise<Product | undefined> {
  const supabase = createStorefrontClient();
  if (!supabase) return undefined;

  const { data, error } = await supabase.rpc("get_storefront_products", {
    p_ids: null,
    p_slugs: [slug],
  });

  if (error) reportStorefrontError("Storefront product unavailable", error);

  return Array.isArray(data) && data[0]
    ? mapProduct(data[0] as Record<string, unknown>)
    : undefined;
}

const fetchProductCached = unstable_cache(fetchProduct, ["storefront-product-v2"], {
  revalidate: CACHE_SECONDS,
  tags: [STOREFRONT_CATALOG_TAG],
});
const fetchProductForRequest = cache(fetchProductCached);

export async function getProduct(slug: string): Promise<Product | undefined> {
  const normalizedSlug = slug.trim().slice(0, 180);
  if (!normalizedSlug) return undefined;

  try {
    return await fetchProductForRequest(normalizedSlug);
  } catch {
    return undefined;
  }
}

export async function getRelatedProducts(
  product: Pick<Product, "id" | "categorySlug">,
  max = 3,
): Promise<Product[]> {
  const requestedMax = Number.isFinite(max) ? Math.trunc(max) : 3;
  const limit = Math.min(Math.max(requestedMax, 0), 12);
  if (limit === 0 || !product.categorySlug) return [];

  const catalog = await getCatalog({
    categorySlug: product.categorySlug,
    page: 1,
    pageSize: Math.min(limit + 1, 48),
  });

  return catalog.products.filter((item) => item.id !== product.id).slice(0, limit);
}
