import "server-only";

import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

// API de conversiones de Meta: informa cada compra cobrada desde el servidor, así Instagram la ve aunque
// el navegador bloquee el píxel. Solo se manda si el cliente aceptó las cookies de medición al comprar,
// con el mail y el teléfono cifrados (SHA-256), y con el mismo identificador que usa el píxel para que
// Meta no la cuente dos veces.

const sha = (value: string) => createHash("sha256").update(value.trim().toLowerCase()).digest("hex");

function normalizedPhone(phone: string) {
  let digits = phone.replace(/\D/g, "").replace(/^00/, "");
  if (digits.startsWith("54")) return digits;
  digits = digits.replace(/^0/, "");
  return `549${digits}`;
}

export function metaCapiEnabled() {
  return Boolean(process.env.META_CAPI_TOKEN && process.env.NEXT_PUBLIC_META_PIXEL_ID);
}

type OrderRow = {
  id: string;
  order_number: string;
  payment_status: string;
  total: number | string;
  paid_at: string | null;
  customer_email_snapshot: string;
  customer_phone_snapshot: string;
  attribution: Record<string, unknown> | null;
  storefront_order_items: { sku_snapshot: string; quantity: number; unit_price_snapshot: number | string }[];
};

export async function reportPurchaseToMeta(orderId: string) {
  if (!metaCapiEnabled()) return { sent: false, reason: "sin configurar" };
  const service = createServiceClient();
  if (!service) return { sent: false, reason: "sin base" };
  const { data } = await service
    .from("storefront_orders")
    .select(
      "id,order_number,payment_status,total,paid_at,customer_email_snapshot,customer_phone_snapshot,attribution,storefront_order_items(sku_snapshot,quantity,unit_price_snapshot)",
    )
    .eq("id", orderId)
    .maybeSingle();
  const order = data as OrderRow | null;
  if (!order || order.payment_status !== "approved") return { sent: false, reason: "sin cobrar" };
  const attribution = order.attribution ?? {};
  if (attribution.ads !== "accepted") return { sent: false, reason: "sin permiso" };
  if (attribution.meta_reported_at) return { sent: false, reason: "ya informada" };

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://chetechstore.com").replace(/\/$/, "");
  const userData: Record<string, unknown> = {
    em: [sha(order.customer_email_snapshot)],
    ph: [sha(normalizedPhone(order.customer_phone_snapshot))],
    country: [sha("ar")],
  };
  if (typeof attribution.fbp === "string" && attribution.fbp) userData.fbp = attribution.fbp;
  if (typeof attribution.fbc === "string" && attribution.fbc) userData.fbc = attribution.fbc;

  const version = process.env.META_GRAPH_VERSION ?? "v23.0";
  const response = await fetch(
    `https://graph.facebook.com/${version}/${process.env.NEXT_PUBLIC_META_PIXEL_ID}/events?access_token=${encodeURIComponent(process.env.META_CAPI_TOKEN ?? "")}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [
          {
            event_name: "Purchase",
            event_time: Math.floor(new Date(order.paid_at ?? Date.now()).getTime() / 1000),
            event_id: order.order_number,
            action_source: "website",
            event_source_url: `${site}/carrito`,
            user_data: userData,
            custom_data: {
              currency: "ARS",
              value: Number(order.total),
              order_id: order.order_number,
              content_type: "product",
              contents: order.storefront_order_items.map((item) => ({
                id: item.sku_snapshot,
                quantity: item.quantity,
                item_price: Number(item.unit_price_snapshot),
              })),
            },
          },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) {
    console.error("Meta no aceptó la compra", order.order_number, response.status, (await response.text()).slice(0, 200));
    return { sent: false, reason: `Meta ${response.status}` };
  }
  await service
    .from("storefront_orders")
    .update({ attribution: { ...attribution, meta_reported_at: new Date().toISOString() } })
    .eq("id", order.id);
  return { sent: true };
}
