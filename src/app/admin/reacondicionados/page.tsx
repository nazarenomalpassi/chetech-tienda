import { AdminProductTable } from "@/components/admin-product-table";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AdminRefurbishedPage({
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
    .in("condition", ["Reacondicionado", "Usado"])
    .order("updated_at", { ascending: false })
    .limit(100);
  if (q.trim())
    query = query.or(
      `name.ilike.%${q.trim().slice(0, 80)}%,sku.ilike.%${q.trim().slice(0, 80)}%,model.ilike.%${q.trim().slice(0, 80)}%`,
    );
  const { data } = await query;
  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">Equipos seleccionados</p>
        <h1>Reacondicionados</h1>
        <p>
          La condición, descripción, pruebas, accesorios y garantía deben informarse sin ocultar
          detalles conocidos.
        </p>
      </div>
      <form className="admin-search">
        <label htmlFor="refurb-search">Buscar equipo</label>
        <div>
          <input id="refurb-search" name="q" defaultValue={q} />
          <button className="button primary">Buscar</button>
        </div>
      </form>
      <AdminProductTable products={data ?? []} />
    </>
  );
}
