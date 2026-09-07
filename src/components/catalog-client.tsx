"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { normalizeSearch } from "@/lib/search";
import type { CatalogSort, Product, ProductCondition } from "@/lib/types";
import { whatsappUrl } from "@/lib/whatsapp";

type CatalogClientProps = {
  products: Product[];
  boardMode?: boolean;
  emptyTitle?: string;
  emptyText?: string;
};

const sortLabels: Array<[CatalogSort, string]> = [
  ["recent", "Más recientes"],
  ["price-asc", "Menor precio"],
  ["price-desc", "Mayor precio"],
  ["name", "Nombre"],
];

export function CatalogClient({
  products,
  boardMode = false,
  emptyTitle,
  emptyText,
}: CatalogClientProps) {
  const [search, setSearch] = useState("");
  const [condition, setCondition] = useState<ProductCondition | "all">("all");
  const [sort, setSort] = useState<CatalogSort>("recent");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterPanelRef = useRef<HTMLElement>(null);
  const filtersId = boardMode ? "board-catalog-filters" : "refurbished-catalog-filters";

  useEffect(() => {
    if (!filtersOpen) return;
    const triggerElement = filterTriggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
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

    window.addEventListener("keydown", handleKeyDown);
    const focusFrame = window.requestAnimationFrame(() =>
      filterPanelRef.current?.querySelector<HTMLElement>(".filter-close")?.focus(),
    );
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerElement?.focus();
    };
  }, [filtersOpen]);

  const conditionOptions = useMemo(() => {
    return [...new Set(products.map((product) => product.condition))].map((value) => ({
      value,
      count: products.filter((product) => product.condition === value).length,
    }));
  }, [products]);

  const filtered = useMemo(() => {
    const needle = normalizeSearch(search);
    const result = products.filter((product) => {
      const text = [
        product.name,
        product.sku,
        product.brand,
        product.model,
        product.board?.code,
        product.board?.partNumber,
        product.board?.compatibleModels.join(" "),
      ].join(" ");
      return (
        (!needle || normalizeSearch(text).includes(needle)) &&
        (condition === "all" || product.condition === condition)
      );
    });
    return [...result].sort((a, b) =>
      sort === "price-asc"
        ? a.price - b.price
        : sort === "price-desc"
          ? b.price - a.price
          : sort === "name"
            ? a.name.localeCompare(b.name)
            : Number(Boolean(b.isNewArrival)) - Number(Boolean(a.isNewArrival)),
    );
  }, [products, search, condition, sort]);

  const activeCount = Number(Boolean(search.trim())) + Number(condition !== "all");

  function clearFilters() {
    setSearch("");
    setCondition("all");
    setFiltersOpen(false);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (filtersOpen) setFiltersOpen(false);
  }

  return (
    <div className="catalog-layout">
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
        id={filtersId}
        className={`filters catalog-filters ${filtersOpen ? "open" : ""}`}
        aria-label={boardMode ? "Filtros de placas de TV" : "Filtros de reacondicionados"}
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
          <label htmlFor={`${filtersId}-search`}>
            {boardMode ? "Buscar por modelo, marca o código" : "Buscar productos"}
          </label>
          <div>
            <input
              id={`${filtersId}-search`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={boardMode ? "Ej. 32PHG5102" : "¿Qué estás buscando?"}
              maxLength={100}
            />
            <button type="submit" aria-label="Buscar">
              <Search />
            </button>
          </div>
        </form>

        {conditionOptions.length > 1 && (
          <fieldset className="filter-section condition-filter">
            <legend>Condición</legend>
            <div className="condition-options">
              <button
                type="button"
                className={condition === "all" ? "active" : ""}
                aria-pressed={condition === "all"}
                onClick={() => setCondition("all")}
              >
                Todas <span>{products.length}</span>
              </button>
              {conditionOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={condition === option.value ? "active" : ""}
                  aria-pressed={condition === option.value}
                  onClick={() => setCondition(option.value)}
                >
                  {option.value} <span>{option.count}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="filter-actions">
          <button
            type="button"
            className="button primary apply-filters"
            onClick={() => setFiltersOpen(false)}
          >
            Aplicar filtros
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={clearFilters}
            disabled={activeCount === 0}
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
            aria-controls={filtersId}
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
              <strong>{filtered.length}</strong>{" "}
              {filtered.length === 1 ? "resultado" : "resultados"}
            </p>
            <div className="active-filter-list" aria-label="Filtros activos">
              {condition !== "all" && (
                <button type="button" onClick={() => setCondition("all")}>
                  {condition}
                  <X aria-hidden="true" />
                </button>
              )}
              {search.trim() && (
                <button type="button" onClick={() => setSearch("")}>
                  &ldquo;{search.trim()}&rdquo;
                  <X aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          <label>
            Ordenar
            <select value={sort} onChange={(event) => setSort(event.target.value as CatalogSort)}>
              {sortLabels.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filtered.length ? (
          <div className="catalog-grid-frame">
            <div className="product-grid catalog-product-grid">
              {filtered.map((product, index) => (
                <ProductCard key={product.id} product={product} revealIndex={index} />
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-state catalog-empty">
            <span>00</span>
            <h2>
              {products.length
                ? "No encontramos coincidencias"
                : (emptyTitle ?? "No hay productos disponibles en este momento")}
            </h2>
            <p>
              {products.length
                ? "Probá con menos palabras o consultanos por WhatsApp."
                : (emptyText ??
                  "Escribinos por WhatsApp y te ayudamos a encontrar lo que necesitás.")}
            </p>
            {products.length ? (
              <button type="button" className="button secondary" onClick={clearFilters}>
                Limpiar filtros
              </button>
            ) : (
              <a
                className="button primary"
                href={whatsappUrl(
                  boardMode
                    ? "Hola, Chetech. Quiero consultar por una placa de televisión."
                    : "Hola, Chetech. Quiero consultar por un producto.",
                )}
                target="_blank"
                rel="noreferrer"
              >
                Consultar por WhatsApp
              </a>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
