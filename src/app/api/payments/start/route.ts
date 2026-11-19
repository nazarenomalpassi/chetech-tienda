import { NextResponse } from "next/server";
import { getCustomerOrder } from "@/lib/commerce/customer-order";
import { startMercadoPagoCheckout } from "@/lib/commerce/payments";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limited = rateLimit(request, "mp-start", 6, 60_000);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { order?: string; token?: string };
  const order = await getCustomerOrder(String(body.order ?? ""), body.token ? String(body.token) : null);
  if (!order) return NextResponse.json({ error: "No encontramos el pedido." }, { status: 404 });
  try {
    return NextResponse.json({ redirect: await startMercadoPagoCheckout(order) });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "No pudimos abrir Mercado Pago." },
      { status: 400 },
    );
  }
}
