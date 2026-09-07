import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AdminCategoriesPage() {
  await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("storefront_products")
    .select("category_name,category_slug,is_published,archived_at")
    .limit(1000);
  const categories = new Map<
    string,
    { name: string; slug: string; total: number; published: number }
  >();
  for (const row of data ?? []) {
    const slug = String(row.category_slug);
    const item = categories.get(slug) ?? {
      name: String(row.category_name),
      slug,
      total: 0,
      published: 0,
    };
    item.total += 1;
    if (row.is_published && !row.archived_at) item.published += 1;
    categories.set(slug, item);
  }
  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">Organización</p>
        <h1>Categorías</h1>
        <p>
          Estas categorías se sincronizan desde el sistema interno. Acá se audita su resultado
          público sin modificar la fuente operativa.
        </p>
      </div>
      <div className="admin-category-grid">
        {[...categories.values()]
          .sort((a, b) => a.name.localeCompare(b.name, "es"))
          .map((category) => (
            <article key={category.slug}>
              <span>{category.total} productos</span>
              <h2>{category.name}</h2>
              <p>{category.published} publicados</p>
              <Link
                className="text-link"
                href={`/productos?categoria=${encodeURIComponent(category.slug)}`}
              >
                Ver en la tienda
              </Link>
            </article>
          ))}
      </div>
    </>
  );
}
