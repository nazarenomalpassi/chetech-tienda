import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CatalogHero } from "@/components/catalog-hero";
import { StorefrontCatalogClient } from "@/components/storefront-catalog-client";
import { getCatalog } from "@/lib/catalog";
import type { CatalogSort, ProductCondition } from "@/lib/types";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Productos",
  description: "Catálogo de tecnología, accesorios y equipos seleccionados de Chetech.",
  alternates: { canonical: "/productos" },
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const rawCategory = first(params.categoria)?.trim() ?? "";
  const categorySlug = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(rawCategory) ? rawCategory : undefined;
  const rawCondition = first(params.condicion)?.trim() ?? "";
  const condition = (["Nuevo", "Reacondicionado", "Usado"] as const).includes(
    rawCondition as ProductCondition,
  )
    ? (rawCondition as ProductCondition)
    : undefined;
  const rawSort = first(params.orden)?.trim() ?? "recent";
  const sort = (["recent", "price-asc", "price-desc", "name"] as const).includes(
    rawSort as CatalogSort,
  )
    ? (rawSort as CatalogSort)
    : "recent";
  const search = (first(params.buscar) ?? "").trim().slice(0, 100);
  const parsedPage = Number.parseInt(first(params.pagina) ?? "1", 10);
  const page = Number.isFinite(parsedPage) ? Math.min(Math.max(parsedPage, 1), 10000) : 1;

  const catalog = await getCatalog({ categorySlug, condition, search, sort, page, pageSize: 24 });
  const invalidCategory =
    categorySlug &&
    catalog.categories.length > 0 &&
    !catalog.categories.some((category) => category.slug === categorySlug);
  if (invalidCategory) {
    const query = new URLSearchParams();
    if (condition) query.set("condicion", condition);
    if (search) query.set("buscar", search);
    if (sort !== "recent") query.set("orden", sort);
    const suffix = query.toString();
    redirect(suffix ? `/productos?${suffix}` : "/productos");
  }
  if (catalog.totalPages > 0 && page > catalog.totalPages) {
    const query = new URLSearchParams();
    if (categorySlug) query.set("categoria", categorySlug);
    if (condition) query.set("condicion", condition);
    if (search) query.set("buscar", search);
    if (sort !== "recent") query.set("orden", sort);
    if (catalog.totalPages > 1) query.set("pagina", String(catalog.totalPages));
    const suffix = query.toString();
    redirect(suffix ? `/productos?${suffix}` : "/productos");
  }

  return (
    <>
      <CatalogHero />
      <section className="catalog-section catalog-shell">
        <StorefrontCatalogClient
          catalog={catalog}
          active={{ categorySlug, condition, search, sort }}
        />
      </section>
    </>
  );
}
