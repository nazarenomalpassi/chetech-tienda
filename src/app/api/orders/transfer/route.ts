import { after, NextResponse } from "next/server";
import { hashToken } from "@/lib/commerce/tokens";
import { processOutbox } from "@/lib/mail/outbox";
import { rateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";

// "Ya transferí": deja constancia, extiende la reserva 24 horas y avisa a Administración.
export async function POST(request: Request) {
  const limited = rateLimit(request, "transfer", 5, 60_000);
  if (limited) return limited;
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "No disponible." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { order?: string; token?: string };
  if (!body.order || !body.token) return NextResponse.json({ error: "Falta la clave del pedido." }, { status: 400 });
  const { error } = await service.rpc("storefront_report_transfer", {
    p_order_number: String(body.order).slice(0, 20),
    p_token_hash: hashToken(String(body.token).slice(0, 100)),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  after(async () => {
    await processOutbox(10).catch(() => undefined);
  });
  return NextResponse.json({ ok: true });
}
