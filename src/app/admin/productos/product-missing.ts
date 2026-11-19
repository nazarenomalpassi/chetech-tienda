// Qué le falta a un producto para venderse sin que el cliente tenga que preguntar (plan, Fase 1).

export type AdminProductRow = {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  model: string | null;
  category_slug: string | null;
  category_name: string | null;
  condition: string | null;
  public_price: number | string;
  is_published: boolean;
  archived_at: string | null;
  primary_image_url: string | null;
  family_override: string | null;
  shipping_size: string | null;
  warranty_months: number | null;
  description_status: string | null;
  storefront_product_images: { count: number }[] | null;
};

export const missingKinds = [
  { key: "foto", label: "Foto" },
  { key: "fotos", label: "3 fotos" },
  { key: "familia", label: "Familia" },
  { key: "envio", label: "Tamaño de envío" },
  { key: "marca", label: "Marca" },
  { key: "garantia", label: "Garantía" },
  { key: "descripcion", label: "Descripción revisada" },
] as const;

export type MissingKind = (typeof missingKinds)[number]["key"];

export function familyOf(row: AdminProductRow, categoryFamilies: Map<string, string>) {
  return row.family_override ?? categoryFamilies.get(row.category_slug ?? "") ?? "otros";
}

export function missingFor(row: AdminProductRow, categoryFamilies: Map<string, string>): MissingKind[] {
  const images = row.storefront_product_images?.[0]?.count ?? (row.primary_image_url ? 1 : 0);
  const missing: MissingKind[] = [];
  if (!row.primary_image_url) missing.push("foto");
  else if (images < 3) missing.push("fotos");
  if (familyOf(row, categoryFamilies) === "otros") missing.push("familia");
  if (!row.shipping_size) missing.push("envio");
  if (!row.brand?.trim()) missing.push("marca");
  if (row.warranty_months === null || row.warranty_months === undefined) missing.push("garantia");
  if (row.description_status !== "manually_reviewed") missing.push("descripcion");
  return missing;
}
