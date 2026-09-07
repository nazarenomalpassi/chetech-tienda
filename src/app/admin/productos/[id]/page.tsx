import { notFound } from "next/navigation";
import { AdminProductForm } from "@/components/admin-forms";
import { AdminImageManager } from "@/components/admin-image-manager";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AdminProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const [{ data }, { data: images }] = await Promise.all([
    supabase.from("storefront_products").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("storefront_product_images")
      .select("id,public_url,alt_text,is_primary,sort_order")
      .eq("storefront_product_id", id)
      .order("sort_order"),
  ]);
  if (!data) notFound();
  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">{data.sku}</p>
        <h1>{data.name}</h1>
        <p>
          Los cambios manuales de nombre y descripción quedan protegidos frente a la sincronización
          automática.
        </p>
      </div>
      <AdminProductForm product={data} />
      <AdminImageManager productId={data.id} images={images ?? []} />
    </>
  );
}
