import { after, NextResponse } from "next/server";
import { mercadoPagoConfig, verifySignature } from "@/lib/commerce/mercadopago";
import { applyMercadoPagoPayment } from "@/lib/commerce/payments";
import { processOutbox } from "@/lib/mail/outbox";
import { createServiceClient } from "@/lib/supabase/service";

// Aviso de pago de Mercado Pago. Solo se acepta con firma válida, cada aviso se procesa una vez y el
// pago se vuelve a consultar antes de tocar el pedido.
export async function POST(request: Request) {
  const config = mercadoPagoConfig();
  const service = createServiceClient();
  if (!config || !service || !config.webhookSecret) {
    return NextResponse.json({ error: "Mercado Pago no está configurado." }, { status: 503 });
  }

  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as { type?: string; action?: string; data?: { id?: unknown } };
  const type = url.searchParams.get("type") ?? body.type ?? "";
  const dataId = url.searchParams.get("data.id") ?? String(body.data?.id ?? "");
  if (!dataId) return NextResponse.json({ ok: true, ignored: "sin id" });

  const valid = verifySignature({
    signature: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId,
    secret: config.webhookSecret,
  });
  if (!valid) return NextResponse.json({ error: "Firma inválida." }, { status: 401 });

  if (type !== "payment") return NextResponse.json({ ok: true, ignored: type || "sin tipo" });

  const eventKey = `${type}:${dataId}:${request.headers.get("x-request-id") ?? ""}`;
  const { data: firstTime } = await service.rpc("storefront_register_webhook", {
    p_provider: "mercadopago",
    p_event_key: eventKey.slice(0, 200),
  });
  if (firstTime === false) return NextResponse.json({ ok: true, duplicate: true });

  try {
    const result = await applyMercadoPagoPayment(dataId);
    after(async () => {
      await processOutbox(10).catch(() => undefined);
    });
    return NextResponse.json({ ok: result.ok });
  } catch (cause) {
    console.error("Error al procesar el aviso de Mercado Pago", cause);
    // 500 hace que Mercado Pago reintente más tarde.
    return NextResponse.json({ error: "No se pudo procesar el aviso." }, { status: 500 });
  }
}
