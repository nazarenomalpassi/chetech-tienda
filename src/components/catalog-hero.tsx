import type { ReactNode } from "react";

type CatalogHeroProps = {
  kicker?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
};

export function CatalogHero({
  kicker = "Catálogo Chetech",
  title = "Productos",
  description = "Tecnología, accesorios y repuestos seleccionados.",
  action,
}: CatalogHeroProps = {}) {
  return (
    <section className="catalog-hero dark-grid" aria-labelledby="catalog-title">
      <div className={`catalog-shell catalog-hero-inner ${action ? "has-action" : ""}`.trim()}>
        <div>
          <p className="kicker">{kicker}</p>
          <h1 id="catalog-title">{title}</h1>
          <p>{description}</p>
        </div>
        {action && <div className="catalog-hero-action">{action}</div>}
      </div>
    </section>
  );
}
