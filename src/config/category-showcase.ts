export type CategoryVisualVariant =
  "connection" | "audio" | "power" | "light" | "data" | "control" | "appliance" | "circuit";

export type CategoryPresentation = {
  featured?: boolean;
  priority?: number;
  subtitle?: string;
  image?: string;
  variant?: CategoryVisualVariant;
};

/**
 * Optional presentation overrides, keyed by the real category slug.
 * Categories still come exclusively from the catalog. An entry here only
 * changes how an existing category is presented on the home page.
 */
export const categoryPresentation: Record<string, CategoryPresentation> = {};

const visualRules: Array<{ pattern: RegExp; variant: CategoryVisualVariant }> = [
  { pattern: /auricular|parlante|audio|sonido/, variant: "audio" },
  { pattern: /cable|adaptador|conector|ficha/, variant: "connection" },
  { pattern: /cargador|bateria|pila|energia/, variant: "power" },
  { pattern: /ilumin|lampara|luz|led/, variant: "light" },
  { pattern: /pendrive|memoria|almacenamiento|usb/, variant: "data" },
  { pattern: /teclado|mouse|control|joystick/, variant: "control" },
  { pattern: /freidora|electrodomestico|cocina/, variant: "appliance" },
];

const fallbackVariants: CategoryVisualVariant[] = ["circuit", "connection", "data", "power"];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function deterministicVariant(value: string) {
  const hash = [...value].reduce((total, character) => total + character.charCodeAt(0), 0);
  return fallbackVariants[hash % fallbackVariants.length];
}

export function getCategoryPresentation(
  name: string,
  slug: string,
): CategoryPresentation & { variant: CategoryVisualVariant } {
  const override = categoryPresentation[slug] ?? {};
  const normalizedName = normalize(name);
  const inferred = visualRules.find(({ pattern }) => pattern.test(normalizedName))?.variant;

  return {
    ...override,
    variant: override.variant ?? inferred ?? deterministicVariant(slug),
  };
}

export function categoryCommercialScore(name: string, slug: string, count: number) {
  const presentation = categoryPresentation[slug];
  const isGeneric = /^(varios|otros|sin categoria)$/.test(normalize(name));

  return (
    (presentation?.featured ? 1_000_000 : 0) +
    (presentation?.priority ?? 0) * 1_000 +
    count -
    (isGeneric ? 10_000 : 0)
  );
}
