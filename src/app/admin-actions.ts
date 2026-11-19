"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOREFRONT_CATALOG_TAG } from "@/lib/catalog";
import { orderStatuses } from "@/lib/orders";

export type AdminActionState = { message?: string; error?: string };

function text(formData: FormData, name: string, max: number) {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

export async function updateStorefrontProductAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin("/admin/productos");
  const id = text(formData, "id", 40);
  const name = text(formData, "name", 200);
  const description = text(formData, "description", 5000);
  const shortDescription = text(formData, "shortDescription", 800);
  if (!id || !name || !description) return { error: "Nombre y descripción son obligatorios." };
  const condition = text(formData, "condition", 30);
  if (!["Nuevo", "Usado", "Reacondicionado"].includes(condition))
    return { error: "La condición no es válida." };
  const boardModels = text(formData, "compatibleModels", 3000)
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 100);
  const now = new Date().toISOString();
  const archived = formData.get("archived") === "on";
  const payload = {
    name,
    name_status: "manually_reviewed",
    name_reviewed_at: now,
    short_description: shortDescription || description.slice(0, 300),
    description,
    description_status: "manually_reviewed",
    description_reviewed_at: now,
    brand: text(formData, "brand", 120),
    model: text(formData, "model", 160),
    condition,
    warranty: text(formData, "warranty", 500) || "A confirmar",
    primary_image_url: text(formData, "primaryImageUrl", 1000) || null,
    is_published: !archived && formData.get("isPublished") === "on",
    is_featured: formData.get("isFeatured") === "on",
    is_offer: formData.get("isOffer") === "on",
    is_new: formData.get("isNew") === "on",
    shipping_enabled: formData.get("shippingEnabled") === "on",
    pickup_enabled: formData.get("pickupEnabled") === "on",
    archived_at: archived ? now : null,
    board_code: text(formData, "boardCode", 160) || null,
    part_number: text(formData, "partNumber", 160) || null,
    board_type: text(formData, "boardType", 120) || null,
    compatible_models: boardModels,
    board_notes: text(formData, "boardNotes", 2000) || null,
    updated_at: now,
  };
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("storefront_products")
    .update(payload)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data)
    return { error: "No pudimos actualizar el producto. Verificá tus permisos y los datos." };
  updateTag(STOREFRONT_CATALOG_TAG);
  revalidatePath("/admin", "layout");
  return { message: "Presentación pública actualizada." };
}

export async function updateOrderAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin("/admin/pedidos");
  const id = text(formData, "id", 40);
  const status = text(formData, "status", 40);
  if (!id || !orderStatuses.includes(status)) return { error: "El estado no es válido." };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("admin_update_storefront_order", {
    p_order_id: id,
    p_status: status,
    p_admin_notes: text(formData, "adminNotes", 4000) || null,
    p_customer_visible_note: text(formData, "customerVisibleNote", 1000) || null,
  });
  if (error) return { error: "No pudimos actualizar el pedido." };
  revalidatePath("/admin/pedidos", "layout");
  revalidatePath("/cuenta/pedidos", "layout");
  return { message: "Pedido actualizado y cambio registrado." };
}

export async function deleteProductImageAction(formData: FormData) {
  await requireAdmin("/admin/productos");
  const id = text(formData, "id", 40);
  const productId = text(formData, "productId", 40);
  if (!id || !productId) return;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("delete_storefront_product_image", {
    p_image_id: id,
    p_product_id: productId,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return;
  const storagePath = String((data as Record<string, unknown>).storage_path ?? "");
  if (storagePath) {
    const { error: storageError } = await supabase.storage
      .from("storefront-products")
      .remove([storagePath]);
    if (storageError) console.error("Product image storage cleanup failed", storageError.message);
  }
  updateTag(STOREFRONT_CATALOG_TAG);
  revalidatePath(`/admin/productos/${productId}`);
}
