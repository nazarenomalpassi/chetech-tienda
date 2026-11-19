import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/store/product-card";
import { SortSelect } from "@/components/store/sort-select";
import { compatFilters, familyBySlug, needBySlug, priceRanges } from "@/config/catalog";
import { getCatalog } from "@/lib/catalog";
import type { CatalogSort } from "@/lib/types";
import { whatsappUrl } from "@/lib/whatsapp";
import styles from "./catalog.module.css";

export const revalidate = 60;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const sorts: CatalogSort[] = ["popular", "recent", "price-asc", "price-desc", "name"];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const family = familyBySlug.get(first(params.familia) ?? "");
  const need = needBySlug.get(first(params.necesidad) ?? "");
  const title = family?.name ?? need?.label ?? "Productos";
  return {
    title,
    description: family?.description ?? "Teles, controles, cargadores, cables, audio y más. Retiro gratis en Río Tercero.",
    alternates: { canonical: family ? `/productos?familia=${family.slug}` : "/productos" },
  };
}

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const family = first(params.familia);
  const need = first(params.necesidad);
  const search = first(params.buscar)?.trim().slice(0, 100);
  const compat = first(params.compat);
  const price = first(params.precio);
  const sortParam = first(params.orden) as CatalogSort | undefined;
  const sort = sortParam && sorts.includes(sortParam) ? sortParam : "popular";
  const page = Number(first(params.pagina) ?? "1") || 1;

  const result = await getCatalog({ family, need, search, compat, priceRange: price, sort, page });
  const familyMeta = family ? familyBySlug.get(family) : undefined;
  const needMeta = need ? needBySlug.get(need) : undefined;

  const hrefWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const current: Record<string, string | undefined> = {
      familia: family,
      necesidad: need,
      buscar: search,
      compat,
      precio: price,
      orden: sort === "popular" ? undefined : sort,
    };
    for (const [key, value] of Object.entries({ ...current, ...changes })) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/productos?${query}` : "/productos";
  };

  const title = search
    ? `Resultados para “${search}”`
    : familyMeta?.name ?? (family === "otros" ? "Otros" : needMeta?.label ?? "Todos los productos");
  const activeFilters = [
    needMeta ? { label: needMeta.label, href: hrefWith({ necesidad: null }) } : null,
    compat ? { label: compatFilters.find((item) => item.slug === compat)?.label ?? compat, href: hrefWith({ compat: null }) } : null,
    price ? { label: priceRanges.find((item) => item.slug === price)?.label ?? price, href: hrefWith({ precio: null }) } : null,
    search ? { label: `“${search}”`, href: hrefWith({ buscar: null }) } : null,
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <div className={styles.page}>
      <div className="page">
        <nav aria-label="Ruta" className={styles.crumbs}>
          <Link href="/">Inicio</Link>
          <span aria-hidden>/</span>
          {family || need || search ? <Link href="/productos">Productos</Link> : <span aria-current="page">Productos</span>}
          {family || need || search ? (
            <>
              <span aria-hidden>/</span>
              <span aria-current="page">{title}</span>
            </>
          ) : null}
        </nav>

        <header className={styles.head}>
          <h1>{title}</h1>
          <p>
            {result.total} {result.total === 1 ? "producto" : "productos"}
            {familyMeta ? `. ${familyMeta.description}` : ""}
          </p>
        </header>

        <nav className={styles.families} aria-label="Familias">
          <Link href={hrefWith({ familia: null, pagina: null })} aria-current={!family ? "page" : undefined}>
            Todas
          </Link>
          {result.families
            .filter((item) => item.count > 0 || item.slug === family)
            .map((item) => (
              <Link
                key={item.slug}
                href={hrefWith({ familia: item.slug, pagina: null })}
                aria-current={family === item.slug ? "page" : undefined}
              >
                {item.name}
                <span>{item.count}</span>
              </Link>
            ))}
        </nav>

        <div className={styles.toolbar}>
          <details className={styles.filters}>
            <summary>Filtrar</summary>
            <div className={styles.filterPanel}>
              <div>
                <p>Conector o tecnología</p>
                <div className={styles.chips}>
                  {compatFilters.map((item) => (
                    <Link
                      key={item.slug}
                      href={hrefWith({ compat: compat === item.slug ? null : item.slug, pagina: null })}
                      aria-current={compat === item.slug ? "true" : undefined}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <p>Precio</p>
                <div className={styles.chips}>
                  {priceRanges.map((item) => (
                    <Link
                      key={item.slug}
                      href={hrefWith({ precio: price === item.slug ? null : item.slug, pagina: null })}
                      aria-current={price === item.slug ? "true" : undefined}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </details>
          <SortSelect value={sort} />
        </div>

        {activeFilters.length ? (
          <div className={styles.active} aria-label="Filtros aplicados">
            {activeFilters.map((filter) => (
              <Link key={filter.label} href={filter.href} className={styles.activeChip}>
                {filter.label}
                <span aria-hidden>×</span>
                <span className="visually-hidden">Quitar filtro</span>
              </Link>
            ))}
            <Link href={family ? `/productos?familia=${family}` : "/productos"} className="enlace">
              Limpiar filtros
            </Link>
          </div>
        ) : null}

        {result.products.length ? (
          <div className={styles.grid}>
            {result.products.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} priority={index < 4} />
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <h2>No encontramos productos con esos filtros.</h2>
            <p>Probá con otra palabra o sacá algún filtro. Si buscás algo puntual, preguntanos: muchas cosas las conseguimos.</p>
            <div className={styles.emptyActions}>
              <Link href="/productos" className="btn" data-variant="secondary">
                Ver todos los productos
              </Link>
              <a
                className="btn"
                data-variant="whatsapp"
                href={whatsappUrl(`Hola, busco ${search ?? "un producto"}. ¿Lo tienen?`)}
                target="_blank"
                rel="noreferrer"
              >
                Preguntar por WhatsApp
              </a>
            </div>
          </div>
        )}

        {result.totalPages > 1 ? (
          <nav className={styles.pagination} aria-label="Páginas">
            {result.page > 1 ? (
              <Link href={hrefWith({ pagina: String(result.page - 1) })} className="btn" data-variant="quiet">
                Anterior
              </Link>
            ) : (
              <span />
            )}
            <span>
              Página {result.page} de {result.totalPages}
            </span>
            {result.page < result.totalPages ? (
              <Link href={hrefWith({ pagina: String(result.page + 1) })} className="btn" data-variant="secondary">
                Siguiente
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
