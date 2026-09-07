"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ProductCard } from "@/components/product-card";
import type { CatalogResult, CatalogSort, ProductCondition } from "@/lib/types";

type ActiveFilters = {
  categorySlug?: string;
  condition?: ProductCondition;
  search: string;
  sort: CatalogSort;
};

type FilterPatch = Partial<{
  categorySlug: string;
  condition: ProductCondition;
  search: string;
  sort: CatalogSort;
}>;

const sortLabels: Array<[CatalogSort, string]> = [
  ["recent", "Más recientes"],
  ["price-asc", "Menor precio"],
  ["price-desc", "Mayor precio"],
  ["name", "Nombre"],
];

function pageWindow(current: number, total: number) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  return [...pages].filter((page) => page > 0 && page <= total).sort((a, b) => a - b);
}

export function StorefrontCatalogClient({
  catalog,
  active,
}: {
  catalog: CatalogResult;
  active: ActiveFilters;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftSearch, setDraftSearch] = useState(active.search);
  const [draftCategory, setDraftCategory] = useState(active.categorySlug ?? "");
  const [draftCondition, setDraftCondition] = useState<ProductCondition | "">(
    active.condition ?? "",
  );
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterPanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setDraftSearch(active.search);
    setDraftCategory(active.categorySlug ?? "");
    setDraftCondition(active.condition ?? "");
  }, [active.categorySlug, active.condition, active.search]);

  useEffect(() => {
    if (!filtersOpen) return;
    const triggerElement = filterTriggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
      if (event.key !== "Tab" || !filterPanelRef.current) return;
      const focusable = [
        ...filterPanelRef.current.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), [href]",
        ),
      ];
      if (!focusable.length) return;
      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    const focusFrame = window.requestAnimationFrame(() =>
      filterPanelRef.current?.querySelector<HTMLElement>(".filter-close")?.focus(),
    );
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      triggerElement?.focus();
    };
  }, [filtersOpen]);

  const activeCount =
    Number(Boolean(active.categorySlug)) +
    Number(Boolean(active.condition)) +
    Number(Boolean(active.search));
  const allProductCount = catalog.categories.reduce((sum, category) => sum + category.count, 0);
  const selectedCategory = catalog.categories.find(
    (category) => category.slug === active.categorySlug,
  );

  function buildHref(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) params.delete("pagina");
    else params.set("pagina", String(page));
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function commit(patch: FilterPatch, closeDrawer = false) {
    const params = new URLSearchParams(searchParams.toString());
    const next = {
      categorySlug: patch.categorySlug ?? active.categorySlug ?? "",
      condition: patch.condition ?? active.condition ?? "",
      search: patch.search ?? active.search,
      sort: patch.sort ?? active.sort,
    };

    if ("categorySlug" in patch && !patch.categorySlug) next.categorySlug = "";
    if ("condition" in patch && !patch.condition) next.condition = "";
    if ("search" in patch && !patch.search) next.search = "";

    if (next.categorySlug) params.set("categoria", next.categorySlug);
    else params.delete("categoria");
    if (next.condition) params.set("condicion", next.condition);
    else params.delete("condicion");
    if (next.search.trim()) params.set("buscar", next.search.trim().slice(0, 100));
    else params.delete("buscar");
    if (next.sort !== "recent") params.set("orden", next.sort);
    else params.delete("orden");
    params.delete("pagina");

    const query = params.toString();
    startTransition(() =>
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }),
    );
    if (closeDrawer) setFiltersOpen(false);
  }

  function selectCategory(categorySlug: string) {
    setDraftCategory(categorySlug);
    if (!filtersOpen) commit({ categorySlug });
  }

  function selectCondition(condition: ProductCondition | "") {
    setDraftCondition(condition);
    if (!filtersOpen) commit({ condition: condition || undefined });
  }

  function applyFilters() {
    commit(
      {
        categorySlug: draftCategory,
        condition: draftCondition || undefined,
        search: draftSearch,
      },
      true,
    );
  }

  function clearFilters() {
    setDraftSearch("");
    setDraftCategory("");
    setDraftCondition("");
    startTransition(() => router.push(pathname, { scroll: false }));
    setFiltersOpen(false);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (filtersOpen) {
      applyFilters();
      return;
    }
    commit({ search: draftSearch });
  }

  const pages = useMemo(
    () => pageWindow(catalog.page, catalog.totalPages),
    [catalog.page, catalog.totalPages],
  );

  return (
    <div className="catalog-layout" aria-busy={isPending}>
      {filtersOpen && (
        <button
          type="button"
          className="filter-backdrop"
          aria-label="Cerrar filtros"
          onClick={() => setFiltersOpen(false)}
        />
      )}

      <aside
        ref={filterPanelRef}
        id="catalog-filters"
        className={`filters catalog-filters ${filtersOpen ? "open" : ""}`}
        aria-label="Filtros del catálogo"
        role={filtersOpen ? "dialog" : undefined}
        aria-modal={filtersOpen || undefined}
      >
        <div className="filter-heading">
          <div>
            <small>{"/// 01"}</small>
            <strong>Filtrar</strong>
            {activeCount > 0 && <span>{activeCount} activos</span>}
          </div>
          <button
            type="button"
            className="filter-close"
            onClick={() => setFiltersOpen(false)}
            aria-label="Cerrar filtros"
          >
            <X />
          </button>
        </div>

        <form className="catalog-search" onSubmit={submitSearch} role="search">
          <label htmlFor="catalog-search">Buscar productos</label>
          <div>
            <input
              id="catalog-search"
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="¿Qué estás buscando?"
              maxLength={100}
            />
            <button type="submit" aria-label="Buscar">
              <Search />
            </button>
          </div>
        </form>

        <fieldset className="filter-section category-filter">
          <legend>Categorías</legend>
          <div className="category-options">
            <button
              type="button"
              className={!draftCategory ? "active" : ""}
              aria-pressed={!draftCategory}
              onClick={() => selectCategory("")}
            >
              <span>Todas</span>
              <strong>{allProductCount}</strong>
              <ChevronRight aria-hidden="true" />
            </button>
            {catalog.categories.map((category) => (
              <button
                type="button"
                key={category.slug}
                className={draftCategory === category.slug ? "active" : ""}
                aria-pressed={draftCategory === category.slug}
                onClick={() => selectCategory(category.slug)}
              >
                <span>{category.name}</span>
                <strong>{category.count}</strong>
                <ChevronRight aria-hidden="true" />
              </button>
            ))}
          </div>
        </fieldset>

        {catalog.conditions.length > 1 && (
          <fieldset className="filter-section condition-filter">
            <legend>Condición</legend>
            <div className="condition-options">
              <button
                type="button"
                className={!draftCondition ? "active" : ""}
                aria-pressed={!draftCondition}
                onClick={() => selectCondition("")}
              >
                Todas
              </button>
              {catalog.conditions.map((condition) => (
                <button
                  type="button"
                  key={condition.value}
                  className={draftCondition === condition.value ? "active" : ""}
                  aria-pressed={draftCondition === condition.value}
                  onClick={() => selectCondition(condition.value)}
                >
                  {condition.value} <span>{condition.count}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="filter-actions">
          <button type="button" className="button primary apply-filters" onClick={applyFilters}>
            Aplicar filtros
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={clearFilters}
            disabled={
              activeCount === 0 &&
              !draftCategory &&
              !draftCondition &&
              !draftSearch &&
              active.sort === "recent"
            }
          >
            Limpiar filtros
          </button>
        </div>
      </aside>

      <section className="catalog-results">
        <div className="results-head">
          <button
            ref={filterTriggerRef}
            type="button"
            className="filter-trigger"
            onClick={() => setFiltersOpen(true)}
            aria-controls="catalog-filters"
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal />
            <span>Filtrar</span>
            {activeCount > 0 && (
              <strong aria-label={`${activeCount} filtros activos`}>{activeCount}</strong>
            )}
          </button>
          <div className="results-summary">
            <p aria-live="polite" aria-atomic="true">
              <strong>{catalog.total}</strong> {catalog.total === 1 ? "resultado" : "resultados"}
            </p>
            <div className="active-filter-list" aria-label="Filtros activos">
              {selectedCategory && (
                <button type="button" onClick={() => commit({ categorySlug: "" })}>
                  {selectedCategory.name}
                  <X aria-hidden="true" />
                </button>
              )}
              {active.condition && (
                <button type="button" onClick={() => commit({ condition: undefined })}>
                  {active.condition}
                  <X aria-hidden="true" />
                </button>
              )}
              {active.search && (
                <button
                  type="button"
                  onClick={() => {
                    setDraftSearch("");
                    commit({ search: "" });
                  }}
                >
                  &ldquo;{active.search}&rdquo;
                  <X aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          <label>
            Ordenar
            <select
              value={active.sort}
              onChange={(event) => commit({ sort: event.target.value as CatalogSort })}
            >
              {sortLabels.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {catalog.products.length ? (
          <div className="catalog-grid-frame">
            {isPending && (
              <div className="catalog-skeleton-grid" aria-hidden="true">
                {Array.from({ length: 8 }, (_, index) => (
                  <div className="catalog-skeleton" key={index}>
                    <span />
                    <i />
                    <i />
                    <b />
                  </div>
                ))}
              </div>
            )}
            <div className={`product-grid catalog-product-grid ${isPending ? "is-loading" : ""}`}>
              {catalog.products.map((product, index) => (
                <ProductCard key={product.id} product={product} revealIndex={index} />
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <span>00</span>
            <h2>No encontramos coincidencias</h2>
            <p>Probá con otra categoría o con menos palabras.</p>
            <button type="button" className="button secondary" onClick={clearFilters}>
              Limpiar filtros
            </button>
          </div>
        )}

        {catalog.totalPages > 1 && (
          <nav className="catalog-pagination" aria-label="Páginas del catálogo">
            {catalog.page > 1 && (
              <Link href={buildHref(catalog.page - 1)} rel="prev">
                Anterior
              </Link>
            )}
            <div>
              {pages.map((page, index) => {
                const previous = pages[index - 1];
                return (
                  <span key={page}>
                    {previous && page - previous > 1 && <i aria-hidden="true">…</i>}
                    <Link
                      href={buildHref(page)}
                      aria-current={page === catalog.page ? "page" : undefined}
                    >
                      {page}
                    </Link>
                  </span>
                );
              })}
            </div>
            {catalog.page < catalog.totalPages && (
              <Link href={buildHref(catalog.page + 1)} rel="next">
                Siguiente
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
