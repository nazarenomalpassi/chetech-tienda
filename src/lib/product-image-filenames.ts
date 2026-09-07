const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const NAMED_SUFFIX_ORDER = new Map([
  ["frente", 10],
  ["atras", 11],
  ["caja", 12],
  ["detalle", 13],
]);

export type ProductImageMatch = {
  sku: string;
  extension: "jpg" | "jpeg" | "png" | "webp";
  isPrimary: boolean;
  sortOrder: number;
  suffix?: string;
};

/**
 * Resolves an image filename against real SKUs without deriving or changing
 * a commercial SKU. Longest candidates are checked first so SKUs containing
 * hyphens (for example TV-SAM-001) are never cut at the first separator.
 */
export function matchProductImageFilename(
  filename: string,
  existingSkus: readonly string[],
): ProductImageMatch | null {
  if (!filename || filename.startsWith(".") || filename.includes("/") || filename.includes("\\"))
    return null;

  const extensionSeparator = filename.lastIndexOf(".");
  if (extensionSeparator <= 0) return null;

  const extension = filename.slice(extensionSeparator + 1).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) return null;

  const basename = filename.slice(0, extensionSeparator);
  const basenameComparison = basename.toLocaleUpperCase("es-AR");
  const skusByLength = [...existingSkus]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  for (const sku of skusByLength) {
    const skuComparison = sku.toLocaleUpperCase("es-AR");
    if (basenameComparison === skuComparison) {
      return {
        sku,
        extension: extension as ProductImageMatch["extension"],
        isPrimary: true,
        sortOrder: 0,
      };
    }

    if (
      !basenameComparison.startsWith(`${skuComparison}-`) &&
      !basenameComparison.startsWith(`${skuComparison}_`)
    )
      continue;

    const suffix = basename.slice(sku.length + 1).toLowerCase();
    if (/^[1-9]\d*$/.test(suffix)) {
      return {
        sku,
        extension: extension as ProductImageMatch["extension"],
        isPrimary: false,
        sortOrder: Number(suffix),
        suffix,
      };
    }

    const namedSortOrder = NAMED_SUFFIX_ORDER.get(suffix);
    if (namedSortOrder !== undefined) {
      return {
        sku,
        extension: extension as ProductImageMatch["extension"],
        isPrimary: false,
        sortOrder: namedSortOrder,
        suffix,
      };
    }
  }

  return null;
}
