import Link from "next/link";
import type { CSSProperties } from "react";
import {
  ArrowRight,
  BatteryCharging,
  Cable,
  Cpu,
  Headphones,
  Lightbulb,
  MousePointer2,
  Usb,
  Zap,
} from "lucide-react";
import type { CatalogCategory } from "@/lib/types";
import {
  categoryCommercialScore,
  getCategoryPresentation,
  type CategoryVisualVariant,
} from "@/config/category-showcase";

const visualIcons = {
  connection: Cable,
  audio: Headphones,
  power: BatteryCharging,
  light: Lightbulb,
  data: Usb,
  control: MousePointer2,
  appliance: Zap,
  circuit: Cpu,
} satisfies Record<CategoryVisualVariant, typeof Cpu>;

function tileSize(index: number, total: number) {
  if (index === 0) return total === 1 ? "solo" : "featured";
  if (total === 2 && index === 1) return "pair";
  if (index < 3) return "medium";

  const remaining = total - 3;
  const itemsFromEnd = total - index;
  if (remaining % 3 === 1 && itemsFromEnd === 1) return "full";
  if (remaining % 3 === 2 && itemsFromEnd <= 2) return "wide";
  return "compact";
}

export function CategoryShowcase({ categories }: { categories: CatalogCategory[] }) {
  const rankedCategories = categories
    .map((category) => ({
      ...category,
      score: categoryCommercialScore(category.name, category.slug, category.count),
    }))
    .sort(
      (first, second) => second.score - first.score || first.name.localeCompare(second.name, "es"),
    );

  return (
    <section className="category-showcase" aria-labelledby="category-showcase-title">
      <div className="shell">
        <div className="category-showcase-heading" data-reveal>
          <div>
            <p className="kicker">Explorá el universo Chetech</p>
            <h2 id="category-showcase-title">Categorías principales</h2>
          </div>
          <p>Accesorios, energía y tecnología para resolver lo que necesitás.</p>
        </div>

        <nav className="category-bento-wrap" aria-label="Categorías principales">
          <ul className="category-bento">
            {rankedCategories.map((category, index) => {
              const presentation = getCategoryPresentation(category.name, category.slug);
              const Icon = visualIcons[presentation.variant];
              const countLabel = `${category.count} ${category.count === 1 ? "producto" : "productos"}`;

              return (
                <li
                  className={`category-tile category-tile--${tileSize(index, rankedCategories.length)} category-tile--${presentation.variant}`}
                  key={category.slug}
                  data-reveal
                  style={{ "--reveal-delay": `${Math.min(index, 5) * 55}ms` } as CSSProperties}
                >
                  <Link href={`/productos?categoria=${encodeURIComponent(category.slug)}`}>
                    {presentation.image && (
                      <span
                        className="category-tile-image"
                        style={{ backgroundImage: `url(${presentation.image})` }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="category-motif" aria-hidden="true">
                      <Icon />
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="category-tile-top">
                      <span className="category-count">{countLabel}</span>
                      <ArrowRight />
                    </span>
                    <span className="category-tile-copy">
                      <strong>{category.name}</strong>
                      {presentation.subtitle && <span>{presentation.subtitle}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="category-showcase-footer" data-reveal>
          <span>Catálogo actualizado</span>
          <Link href="/productos">
            Ver todas las categorías <ArrowRight />
          </Link>
        </div>
      </div>
    </section>
  );
}
