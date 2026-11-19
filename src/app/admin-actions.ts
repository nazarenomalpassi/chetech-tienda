"use server";

import { after } from "next/server";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOREFRONT_CATALOG_TAG } from "@/lib/catalog";
import { STORE_SETTINGS_TAG } from "@/lib/store-settings";
import { afterOrderChange } from "@/lib/commerce/after-order-change";
import { orderStatuses } from "@/lib/orders";

export type AdminActionState = { message?: string; error?: string };

const FAMILY_SLUGS = [
  "para-tu-tele",
  "carga-y-energia",
  "audio",
  "celular",
  "compu-y-gaming",
  "hogar",
  "del-taller",
  "otros",
];
const SHIPPING_SIZES = ["chico", "mediano", "grande", "no_viaja"];
const GESTION_METHODS = ["efectivo", "nx", "mp", "transferencia", "otro"];

function text(formData: FormData, name: string, max: number) {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function money(formData: FormData, name: string): number | null {
  const raw = text(formData, name, 20).replace(/\./g, "").replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function integer(formData: FormData, name: string, min: number, max: number, fallback: number) {
  const value = Number.parseInt(text(formData, name, 10), 10);
  return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback;
}

function list(formData: FormData, name: string, max: number, limit = 100) {
  return text(formData, name, max)
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

/** Los errores que la base levanta a propósito traen un texto pensado para mostrar. */
function databaseMessage(error: { code?: string; message?: string } | null, fallback: string) {
  if (error && ["22023", "P0002", "42501", "23514", "23505"].includes(error.code ?? "") && error.message) {
    return error.message;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

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
  const family = text(formData, "familyOverride", 40);
  if (family && !FAMILY_SLUGS.includes(family)) return { error: "La familia no es válida." };
  const shippingSize = text(formData, "shippingSize", 20);
  if (shippingSize && !SHIPPING_SIZES.includes(shippingSize))
    return { error: "El tamaño de envío no es válido." };
  const warrantyRaw = text(formData, "warrantyMonths", 3);
  const warrantyMonths = warrantyRaw ? Number.parseInt(warrantyRaw, 10) : null;
  if (warrantyMonths !== null && !(warrantyMonths >= 0 && warrantyMonths <= 60))
    return { error: "La garantía tiene que ser entre 0 y 60 meses." };
  const videoUrl = text(formData, "videoUrl", 500);
  if (videoUrl && !videoUrl.startsWith("https://"))
    return { error: "El video tiene que ser un enlace que empiece con https://" };

  const now = new Date().toISOString();
  const archived = checked(formData, "archived");
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
    warranty_months: warrantyMonths,
    family_override: family || null,
    shipping_size: shippingSize || null,
    video_url: videoUrl || null,
    box_contents: text(formData, "boxContents", 1000),
    compatible_with: list(formData, "compatibleWith", 2000, 40),
    primary_image_url: text(formData, "primaryImageUrl", 1000) || null,
    is_published: !archived && checked(formData, "isPublished"),
    is_featured: checked(formData, "isFeatured"),
    is_offer: checked(formData, "isOffer"),
    is_new: checked(formData, "isNew"),
    shipping_enabled: checked(formData, "shippingEnabled"),
    pickup_enabled: checked(formData, "pickupEnabled"),
    archived_at: archived ? now : null,
    board_code: text(formData, "boardCode", 160) || null,
    part_number: text(formData, "partNumber", 160) || null,
    board_type: text(formData, "boardType", 120) || null,
    compatible_models: list(formData, "compatibleModels", 3000),
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
    return { error: "No pudimos guardar el producto. Revisá los datos y probá de nuevo." };
  updateTag(STOREFRONT_CATALOG_TAG);
  revalidatePath("/admin", "layout");
  return { message: "Producto guardado. La tienda ya muestra los cambios." };
}

/** Edición en lote desde el listado: familia, tamaño de envío, garantía y publicación. */
export async function bulkProductAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin("/admin/productos");
  const ids = formData
    .getAll("ids")
    .filter((value): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/.test(value))
    .slice(0, 200);
  if (!ids.length) return { error: "Elegí al menos un producto." };
  const patch: Record<string, unknown> = {};
  const family = text(formData, "bulkFamily", 40);
  if (family === "__auto") patch.family_override = null;
  else if (family) {
    if (!FAMILY_SLUGS.includes(family)) return { error: "La familia no es válida." };
    patch.family_override = family;
  }
  const size = text(formData, "bulkShippingSize", 20);
  if (size) {
    if (!SHIPPING_SIZES.includes(size)) return { error: "El tamaño de envío no es válido." };
    patch.shipping_size = size;
  }
  const warranty = text(formData, "bulkWarranty", 3);
  if (warranty) {
    const months = Number.parseInt(warranty, 10);
    if (!(months >= 0 && months <= 60)) return { error: "La garantía tiene que ser entre 0 y 60 meses." };
    patch.warranty_months = months;
  }
  const publication = text(formData, "bulkPublication", 20);
  if (publication === "publish") patch.is_published = true;
  if (publication === "unpublish") patch.is_published = false;
  if (!Object.keys(patch).length) return { error: "Elegí qué cambiar." };
  patch.updated_at = new Date().toISOString();

  const supabase = await createServerSupabaseClient();
  let query = supabase.from("storefront_products").update(patch).in("id", ids);
  // Nunca se publica un archivado.
  if (patch.is_published === true) query = query.is("archived_at", null);
  const { data, error } = await query.select("id");
  if (error) return { error: "No pudimos aplicar el cambio en lote." };
  updateTag(STOREFRONT_CATALOG_TAG);
  revalidatePath("/admin/productos");
  const count = data?.length ?? 0;
  return { message: `Listo: ${count} ${count === 1 ? "producto actualizado" : "productos actualizados"}.` };
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

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

/** Pedidos del circuito anterior (WhatsApp): cambio de estado manual. */
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

const ORDER_ACTIONS: Record<string, string> = {
  confirm_transfer: "Transferencia confirmada. El pedido quedó pagado y la venta, en la gestión.",
  mark_preparing: "Pedido en preparación.",
  mark_ready: "Pedido listo para retirar. Le mandamos el código al cliente.",
  mark_shipped: "Pedido despachado. Le avisamos al cliente.",
  mark_delivered: "Pedido entregado.",
  cancel: "Pedido cancelado y stock liberado.",
  mark_returned: "Devolución registrada.",
  clear_attention: "Aviso resuelto.",
};

/** Pedidos nuevos (compra en la tienda): cada botón llama a una acción con sus controles. */
export async function storefrontOrderAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin("/admin/pedidos");
  const id = text(formData, "id", 40);
  const action = text(formData, "action", 40);
  if (!id || !(action in ORDER_ACTIONS)) return { error: "La acción no es válida." };

  const payload: Record<string, string> = {};
  if (action === "mark_shipped") {
    payload.tracking_code = text(formData, "trackingCode", 60);
    const url = text(formData, "trackingUrl", 500);
    if (url && !url.startsWith("https://"))
      return { error: "El enlace de seguimiento tiene que empezar con https://" };
    payload.tracking_url = url;
  }
  if (action === "mark_delivered") {
    const method = text(formData, "gestionMethod", 20);
    if (method) {
      if (!GESTION_METHODS.includes(method)) return { error: "Elegí con qué pagó el cliente." };
      payload.gestion_method = method;
    }
  }
  if (action === "cancel" || action === "mark_returned") {
    payload.reason = text(formData, "reason", 500);
    payload.customer_note = text(formData, "customerNote", 500);
    if (formData.get("confirm") !== "on")
      return { error: "Marcá la casilla para confirmar. Esta acción no se deshace." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("storefront_admin_order_action", {
    p_order_id: id,
    p_action: action,
    p_payload: payload,
  });
  if (error) return { error: databaseMessage(error, "No pudimos aplicar la acción. Probá de nuevo.") };

  // Los mails que dispara la acción (y el aviso de compra a Meta) salen después de responder.
  after(() => afterOrderChange(id));
  revalidatePath("/admin/pedidos", "layout");
  revalidatePath("/cuenta/pedidos", "layout");
  updateTag(STOREFRONT_CATALOG_TAG);
  return { message: ORDER_ACTIONS[action] };
}

export async function saveOrderNotesAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin("/admin/pedidos");
  const id = text(formData, "id", 40);
  if (!id) return { error: "Falta el pedido." };
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("storefront_orders")
    .update({ admin_notes: text(formData, "adminNotes", 4000) || null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "No pudimos guardar la nota." };
  revalidatePath(`/admin/pedidos/${id}`);
  return { message: "Nota guardada." };
}

// ---------------------------------------------------------------------------
// Configuración de la tienda
// ---------------------------------------------------------------------------

async function saveSetting(key: "checkout" | "delivery" | "promo", value: Record<string, unknown>) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("storefront_admin_save_settings", { p_key: key, p_value: value });
  if (error) return databaseMessage(error, "No pudimos guardar los ajustes.");
  updateTag(STORE_SETTINGS_TAG);
  updateTag(STOREFRONT_CATALOG_TAG);
  revalidatePath("/", "layout");
  return null;
}

export async function saveCheckoutSettingsAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin("/admin/configuracion");
  const alias = text(formData, "transferAlias", 60);
  const cvu = text(formData, "transferCvu", 30).replace(/\D/g, "");
  const transferEnabled = checked(formData, "transferEnabled");
  if (cvu && cvu.length !== 22) return { error: "El CVU o CBU tiene 22 números." };
  if (transferEnabled && !alias && !cvu)
    return { error: "Para activar la transferencia cargá el alias o el CVU." };
  const mercadopagoEnabled = checked(formData, "mercadopagoEnabled");
  if (mercadopagoEnabled && !process.env.MERCADOPAGO_ACCESS_TOKEN)
    return { error: "Mercado Pago necesita sus credenciales cargadas en Railway antes de activarlo." };

  const error = await saveSetting("checkout", {
    mercadopago: { enabled: mercadopagoEnabled },
    transfer: {
      enabled: transferEnabled,
      alias,
      cvu,
      holder: text(formData, "transferHolder", 120),
      cuit: text(formData, "transferCuit", 20),
      bank: text(formData, "transferBank", 80),
      discount_percent: integer(formData, "transferDiscount", 0, 30, 0),
    },
    pickup_payment: {
      enabled: checked(formData, "pickupPaymentEnabled"),
      max_amount: money(formData, "pickupPaymentMax"),
    },
    mercadopago_reservation_minutes: integer(formData, "mercadopagoMinutes", 10, 120, 30),
    offline_reservation_hours: integer(formData, "offlineHours", 2, 72, 24),
    sync_gestion_sales: checked(formData, "syncGestionSales"),
  });
  return error ? { error } : { message: "Cobros guardados. La tienda ya los usa." };
}

export async function saveCouponAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin("/admin/cupones");
  const id = text(formData, "id", 40);
  const code = text(formData, "code", 30).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!id && !/^[A-Z0-9]{3,20}$/.test(code))
    return { error: "El código lleva entre 3 y 20 letras o números, sin espacios." };
  const percent = Number(text(formData, "percent", 6).replace(",", "."));
  if (!Number.isFinite(percent) || percent <= 0 || percent > 50)
    return { error: "El descuento tiene que ser entre 1 % y 50 %." };
  const endsOn = text(formData, "endsOn", 10);
  if (endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) return { error: "Revisá la fecha de vencimiento." };
  const maxUses = Number.parseInt(text(formData, "maxUses", 8), 10);
  const scope = text(formData, "scope", 20);
  const origin = text(formData, "origin", 20);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("storefront_admin_save_coupon", {
    p_input: {
      id: id || null,
      code,
      label: text(formData, "label", 120),
      origin: ["general", "reel", "taller", "mostrador"].includes(origin) ? origin : "general",
      percent,
      scope: scope === "accessories" ? "accessories" : "all",
      min_subtotal: money(formData, "minSubtotal") ?? 0,
      max_discount: money(formData, "maxDiscount") || null,
      max_uses: Number.isFinite(maxUses) && maxUses > 0 ? maxUses : null,
      once_per_customer: checked(formData, "oncePerCustomer"),
      starts_at: text(formData, "startsAt", 40) || null,
      // Vence al final del día elegido, hora de Córdoba.
      ends_at: endsOn ? `${endsOn}T23:59:59-03:00` : null,
      is_active: checked(formData, "isActive"),
    },
  });
  if (error) return { error: databaseMessage(error, "No pudimos guardar el cupón. Probá de nuevo.") };
  updateTag(STORE_SETTINGS_TAG);
  revalidatePath("/admin/cupones");
  return { message: id ? "Cupón guardado." : `Cupón ${code} creado. Ya se puede usar en la compra.` };
}

export async function saveDeliverySettingsAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin("/admin/configuracion");
  const names = formData.getAll("zoneName").map((value) => String(value).trim().slice(0, 60));
  const prices = formData.getAll("zonePrice").map((value) => String(value).replace(/\./g, "").trim());
  const details = formData.getAll("zoneDetail").map((value) => String(value).trim().slice(0, 160));
  const zones = names.flatMap((name, index) => {
    const price = Number(prices[index]);
    if (!name || !prices[index] || !Number.isFinite(price) || price < 0) return [];
    const id = name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    return [{ id: id || `zona-${index + 1}`, name, price: Math.round(price), detail: details[index] ?? "" }];
  });
  const localEnabled = checked(formData, "localEnabled");
  if (localEnabled && !zones.length) return { error: "Para activar la entrega CheTech cargá al menos una zona con precio." };
  const rates = {
    chico: money(formData, "rateChico"),
    mediano: money(formData, "rateMediano"),
    grande: money(formData, "rateGrande"),
  };
  const correoEnabled = checked(formData, "correoEnabled");
  if (correoEnabled && rates.chico === null)
    return { error: "Para activar el correo cargá al menos la tarifa del paquete chico." };

  const error = await saveSetting("delivery", {
    pickup: { enabled: checked(formData, "pickupEnabled") },
    local: { enabled: localEnabled, zones: zones.slice(0, 20) },
    correo: { enabled: correoEnabled, rates },
  });
  return error ? { error } : { message: "Entregas guardadas. La tienda ya las ofrece." };
}

export async function savePromoSettingsAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin("/admin/configuracion");
  const channels = list(formData, "tvChannels", 1000, 5).map((slug) =>
    slug.replace(/^.*\/productos\//, "").replace(/[^a-z0-9-]/gi, "").toLowerCase(),
  );
  const error = await saveSetting("promo", {
    tv_channels: channels.filter(Boolean),
    reel_product_slug: text(formData, "reelProductSlug", 160) || null,
    reel_title: text(formData, "reelTitle", 120),
  });
  return error ? { error } : { message: "Portada guardada." };
}
