import { AdminProductTable } from "@/components/admin-product-table";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AdminBoardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q = "" } = await searchParams;
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("storefront_products")
    .select(
      "id,name,sku,brand,model,category_name,condition,public_price,is_published,archived_at,board_code,part_number",
    )
    .not("board_code", "is", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (q.trim())
    query = query.or(
      `name.ilike.%${q.trim().slice(0, 80)}%,sku.ilike.%${q.trim().slice(0, 80)}%,board_code.ilike.%${q.trim().slice(0, 80)}%,model.ilike.%${q.trim().slice(0, 80)}%,brand.ilike.%${q.trim().slice(0, 80)}%`,
    );
  const { data } = await query;
  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">Repuestos de TV</p>
        <h1>Placas</h1>
        <p>Buscá por SKU, código, modelo o marca y mantené compatibilidades verificadas.</p>
      </div>
      <form className="admin-search">
        <label htmlFor="board-search">Buscar placa</label>
        <div>
          <input id="board-search" name="q" defaultValue={q} />
          <button className="button primary">Buscar</button>
        </div>
      </form>
      <AdminProductTable products={data ?? []} empty="No encontramos placas con esos datos." />
    </>
  );
}
