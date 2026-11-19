import { after, NextResponse } from "next/server";
import { applyMercadoPagoPayment } from "@/lib/commerce/payments";
import { getCustomerOrder } from "@/lib/commerce/customer-order";
import { processOutbox } from "@/lib/mail/outbox";
import { rateLimit } from "@/lib/rate-limit";

// Al volver de Mercado Pago el cliente trae el número de pago: se consulta y se aplica sin esperar el
// aviso. Nunca se confía en lo que dice la dirección de regreso.
export async function POST(request: Request) {
  const limited = rateLimit(request, "mp-sync", 10, 60_000);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { order?: string; token?: string; paymentId?: string };
  const order = await getCustomerOrder(String(body.order ?? ""), body.token ? String(body.token) : null);
  if (!order) return NextResponse.json({ error: "No encontramos el pedido." }, { status: 404 });
  if (!body.paymentId || !/^\d{1,20}$/.test(body.paymentId)) return NextResponse.json({ status: order.status });
  try {
    const result = await applyMercadoPagoPayment(body.paymentId);
    if (result.ok && result.order.id !== order.id) return NextResponse.json({ error: "Pago de otro pedido." }, { status: 400 });
    after(async () => {
      await processOutbox(10).catch(() => undefined);
    });
    return NextResponse.json({ ok: result.ok });
  } catch {
    return NextResponse.json({ error: "Todavía no pudimos confirmar el pago." }, { status: 502 });
  }
}
