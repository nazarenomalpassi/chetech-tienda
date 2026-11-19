import Link from "next/link";
import { families } from "@/config/catalog";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProductBulkTable } from "./product-bulk-table";
import { familyOf, missingFor, missingKinds, type AdminProductRow, type MissingKind } from "./product-missing";
import styles from "./products.module.css";

const COLUMNS =
  "id,name,sku,brand,model,category_slug,category_name,condition,public_price,is_published,archived_at,primary_image_url,family_override,shipping_size,warranty_months,description_status,storefront_product_images(count)";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; falta?: string; familia?: string; estado?: string }>;
}) {
  await requireAdmin("/admin/productos");
  const params = await searchParams;
  const q = (params.q ?? "").replace(/[^\p{L}\p{N} .\-_/]/gu, "").trim().slice(0, 80);
  const falta = missingKinds.some((kind) => kind.key === params.falta) ? (params.falta as MissingKind) : null;
  const familia = families.some((family) => family.slug === params.familia) || params.familia === "otros" ? params.familia : null;
  const estado = ["publicados", "ocultos", "todos"].includes(params.estado ?? "") ? params.estado! : "publicados";

  const supabase = await createServerSupabaseClient();
  let query = supabase.from("storefront_products").select(COLUMNS).order("name").limit(600);
  if (estado === "publicados") query = query.eq("is_published", true).is("archived_at", null);
  if (estado === "ocultos") query = query.eq("is_published", false);
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%`);

  const [{ data, error }, { data: mapRows }] = await Promise.all([
    query,
    supabase.from("storefront_category_families").select("category_slug,family_slug"),
  ]);
  const categoryFamilies = new Map((mapRows ?? []).map((row) => [row.category_slug as string, row.family_slug as string]));
  const all = (data ?? []) as unknown as AdminProductRow[];
  const rows = all
    .map((row) => ({ row, family: familyOf(row, categoryFamilies), missing: missingFor(row, categoryFamilies) }))
    .filter((item) => (falta ? item.missing.includes(falta) : true))
    .filter((item) => (familia ? item.family === familia : true));

  const counts = Object.fromEntries(
    missingKinds.map((kind) => [kind.key, all.filter((row) => missingFor(row, categoryFamilies).includes(kind.key)).length]),
  ) as Record<MissingKind, number>;
  const complete = all.filter((row) => missingFor(row, categoryFamilies).length === 0).length;

  const link = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { q, falta, familia, estado, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value && !(key === "estado" && value === "publicados")) next.set(key, value);
    const text = next.toString();
    return text ? `/admin/productos?${text}` : "/admin/productos";
  };

  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">Catálogo</p>
        <h1>Productos</h1>
        <p>
          Precio, stock y categoría vienen del sistema de gestión. Acá se completa todo lo demás para que cada
          producto se entienda sin preguntar.
        </p>
      </div>

      <section className={styles.summary} aria-label="Qué falta completar">
        <p>
          <strong>
            {complete} de {all.length}
          </strong>{" "}
          {estado === "publicados" ? "productos publicados" : "productos"} están completos.
        </p>
        <ul>
          {missingKinds.map((kind) => (
            <li key={kind.key}>
              <Link href={link({ falta: falta === kind.key ? null : kind.key })} aria-current={falta === kind.key ? "true" : undefined}>
                Sin {kind.label.toLowerCase()} <span>{counts[kind.key]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <form className={styles.filters} role="search">
        <label>
          Buscar
          <input name="q" defaultValue={q} placeholder="Nombre, SKU o marca" />
        </label>
        <label>
          Familia
          <select name="familia" defaultValue={familia ?? ""}>
            <option value="">Todas</option>
            {families.map((family) => (
              <option key={family.slug} value={family.slug}>
                {family.name}
              </option>
            ))}
            <option value="otros">Sin familia</option>
          </select>
        </label>
        <label>
          Mostrar
          <select name="estado" defaultValue={estado}>
            <option value="publicados">Publicados</option>
            <option value="ocultos">Ocultos</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        {falta ? <input type="hidden" name="falta" value={falta} /> : null}
        <button className="btn" data-variant="secondary">
          Filtrar
        </button>
        {q || falta || familia || estado !== "publicados" ? (
          <Link className="enlace" href="/admin/productos">
            Ver todo
          </Link>
        ) : null}
      </form>

      {error ? (
        <p className={styles.error} role="alert">
          No pudimos cargar los productos. Recargá la página.
        </p>
      ) : (
        <ProductBulkTable
          rows={rows.map(({ row, family, missing }) => ({
            id: row.id,
            name: row.name,
            sku: row.sku,
            brand: row.brand,
            price: Number(row.public_price),
            image: row.primary_image_url,
            family,
            published: row.is_published && !row.archived_at,
            archived: Boolean(row.archived_at),
            missing,
          }))}
        />
      )}
    </>
  );
}
