import { after, NextResponse } from "next/server";
import { startMercadoPagoCheckout } from "@/lib/commerce/payments";
import { accessTokenFor, hashToken, newOrderId } from "@/lib/commerce/tokens";
import type { OrderPayload } from "@/lib/commerce/types";
import { processOutbox } from "@/lib/mail/outbox";
import { rateLimit } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type Body = {
  items?: { id?: unknown; quantity?: unknown }[];
  customer?: { name?: unknown; email?: unknown; phone?: unknown };
  delivery?: {
    kind?: unknown;
    zone?: unknown;
    address?: Record<string, unknown>;
  };
  payment_method?: unknown;
  coupon?: unknown;
  notes?: unknown;
  marketing_consent?: unknown;
  attribution?: Record<string, unknown>;
};

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const limited = rateLimit(request, "checkout", 6, 60_000);
  if (limited) return limited;

  const service = createServiceClient();
  if (!service) {
    return NextResponse.json({ error: "La compra online no está disponible en este momento." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "No pudimos leer el pedido." }, { status: 400 });
  }

  const items = (Array.isArray(body.items) ? body.items : [])
    .slice(0, 30)
    .map((item) => ({ storefront_product_id: String(item.id ?? ""), quantity: Math.trunc(Number(item.quantity)) }))
    .filter((item) => uuid.test(item.storefront_product_id) && item.quantity >= 1 && item.quantity <= 10);
  if (!items.length) return NextResponse.json({ error: "El carrito está vacío." }, { status: 400 });

  let userId: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  const orderId = newOrderId();
  const token = accessTokenFor(orderId);
  const attribution = body.attribution ?? {};
  const address = body.delivery?.address ?? {};

  const { data, error } = await service.rpc("storefront_checkout_create", {
    p_input: {
      order_id: orderId,
      items,
      customer: {
        name: text(body.customer?.name, 120),
        email: text(body.customer?.email, 254),
        phone: text(body.customer?.phone, 30),
      },
      delivery: {
        kind: text(body.delivery?.kind, 20) || "pickup",
        zone: text(body.delivery?.zone, 40),
        service: "home",
        address: {
          street: text(address.street, 120),
          number: text(address.number, 20),
          apartment: text(address.apartment, 40),
          city: text(address.city, 80),
          province: text(address.province, 80),
          postal_code: text(address.postal_code, 10),
          notes: text(address.notes, 300),
        },
      },
      payment_method: text(body.payment_method, 20),
      coupon: text(body.coupon, 30),
      notes: text(body.notes, 1000),
      marketing_consent: body.marketing_consent === true,
      user_id: userId,
      access_token_hash: hashToken(token),
      attribution: {
        source: text(attribution.source, 60),
        medium: text(attribution.medium, 60),
        campaign: text(attribution.campaign, 80),
        content: text(attribution.content, 80),
        landing: text(attribution.landing, 120),
        // Permiso de medición elegido en el aviso de cookies, y los identificadores del píxel de Meta
        // (solo si aceptó). Sirven para informar la compra desde el servidor.
        ads: attribution.ads === "accepted" ? "accepted" : "rejected",
        ...(attribution.ads === "accepted"
          ? { fbp: text(attribution.fbp, 120), fbc: text(attribution.fbc, 200) }
          : {}),
      },
    },
  });

  if (error || !data) {
    const conflict = error?.code === "23514" || error?.code === "P0002";
    return NextResponse.json(
      { error: error?.message || "No pudimos crear el pedido. Probá de nuevo." },
      { status: conflict ? 409 : 400 },
    );
  }

  const created = data as { order_number: string; payment_method: string; total: number };
  const orderUrl = `/pedido/${encodeURIComponent(created.order_number)}?t=${token}`;
  let redirect = orderUrl;
  let paymentError: string | null = null;

  if (created.payment_method === "mercadopago") {
    try {
      const { data: order } = await service.rpc("storefront_order_internal", { p_order_id: orderId });
      redirect = await startMercadoPagoCheckout(order as OrderPayload);
    } catch (cause) {
      console.error("No se pudo abrir Mercado Pago", cause);
      paymentError = "Tu pedido quedó reservado, pero no pudimos abrir Mercado Pago. Probá de nuevo desde el pedido.";
    }
  }

  // Los mails salen después de responder: un mail lento nunca demora la compra.
  after(async () => {
    await processOutbox(10).catch(() => undefined);
  });

  return NextResponse.json({
    orderNumber: created.order_number,
    total: created.total,
    orderUrl,
    redirect,
    paymentError,
  });
}
