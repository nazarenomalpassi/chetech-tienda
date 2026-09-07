import { AdminProductTable } from "@/components/admin-product-table";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q = "" } = await searchParams;
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("storefront_products")
    .select("id,name,sku,brand,model,category_name,condition,public_price,is_published,archived_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (q.trim())
    query = query.or(`name.ilike.%${q.trim().slice(0, 80)}%,sku.ilike.%${q.trim().slice(0, 80)}%`);
  const { data } = await query;
  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">Catálogo público</p>
        <h1>Productos</h1>
        <p>
          Editá presentación, publicación e imágenes. Precio, stock y categoría continúan bajo
          control del sistema interno.
        </p>
      </div>
      <form className="admin-search">
        <label htmlFor="product-search">Buscar por nombre o SKU</label>
        <div>
          <input id="product-search" name="q" defaultValue={q} />
          <button className="button primary">Buscar</button>
        </div>
      </form>
      <AdminProductTable products={data ?? []} />
    </>
  );
}
