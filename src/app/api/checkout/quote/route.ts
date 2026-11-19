import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";

type Body = {
  items?: { id?: unknown; quantity?: unknown }[];
  coupon?: unknown;
  email?: unknown;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Valida un cupón contra el carrito y devuelve cuánto descuenta. El total definitivo lo calcula la compra. */
export async function POST(request: Request) {
  // Tope bajo: alcanza para corregir un código mal escrito y frena a quien quiera adivinar cupones.
  const limited = rateLimit(request, "checkout-quote", 12, 60_000);
  if (limited) return limited;

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "No pudimos validar el cupón en este momento." }, { status: 503 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "No pudimos leer el cupón." }, { status: 400 });
  }

  const items = (Array.isArray(body.items) ? body.items : [])
    .slice(0, 30)
    .map((item) => ({ storefront_product_id: String(item.id ?? ""), quantity: Math.trunc(Number(item.quantity)) }))
    .filter((item) => uuid.test(item.storefront_product_id) && item.quantity >= 1 && item.quantity <= 10);
  const coupon = text(body.coupon, 30);
  if (!items.length || !coupon) return NextResponse.json({ error: "Escribí el código del cupón." }, { status: 400 });

  const { data, error } = await service.rpc("storefront_checkout_quote", {
    p_input: { items, coupon, email: text(body.email, 254) },
  });
  if (error || !data) return NextResponse.json({ error: "No pudimos validar el cupón. Probá de nuevo." }, { status: 400 });

  const quote = data as {
    coupon: { ok: boolean; code?: string; percent?: number; amount?: number; error?: string } | null;
  };
  if (!quote.coupon?.ok) {
    return NextResponse.json({ error: quote.coupon?.error ?? "Ese cupón no se puede usar." }, { status: 422 });
  }
  return NextResponse.json({
    code: quote.coupon.code,
    percent: Number(quote.coupon.percent),
    amount: Number(quote.coupon.amount),
  });
}
