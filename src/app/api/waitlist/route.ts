import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { getProducts } from "@/lib/catalog";
import { enqueueNotice, processOutbox } from "@/lib/mail/outbox";
import { createServiceClient } from "@/lib/supabase/service";
import { rateLimit } from "@/lib/rate-limit";
import { waitlistSubject, type WaitlistKind } from "@/lib/waitlist-match";

export async function POST(request: Request) {
  const limited = rateLimit(request, "waitlist", 5, 60_000);
  if (limited) return limited;
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "La lista de aviso no está disponible ahora." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const contact = String(body.contact ?? "").trim().slice(0, 120);
  const isEmail = contact.includes("@");
  const phone = isEmail ? "" : contact.replace(/[^0-9+]/g, "");
  if (!body.consent) return NextResponse.json({ error: "Marcá que aceptás el aviso." }, { status: 400 });
  if (isEmail ? !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact) : phone.length < 8) {
    return NextResponse.json({ error: "Revisá tu WhatsApp o tu mail." }, { status: 400 });
  }
  const kind = (["product", "refurbished", "board"].includes(String(body.kind)) ? String(body.kind) : "product") as WaitlistKind;
  const productId = typeof body.storefront_product_id === "string" ? body.storefront_product_id : null;
  const query = String(body.query ?? "").trim().slice(0, 200);
  const name = String(body.name ?? "").trim().slice(0, 120);
  const { error } = await service.rpc("storefront_join_waitlist", {
    p_input: {
      kind,
      storefront_product_id: productId,
      query,
      name,
      email: isEmail ? contact.toLowerCase() : null,
      phone: isEmail ? null : phone,
      consent: true,
    },
  });
  if (error) return NextResponse.json({ error: "No pudimos guardar tus datos. Probá de nuevo." }, { status: 400 });

  // Aviso para el local: sin esto el pedido quedaría en la lista sin que nadie se entere.
  after(async () => {
    const subject = waitlistSubject({ kind, storefront_product_id: productId, query: query || null }, await getProducts());
    const today = new Date().toISOString().slice(0, 10);
    const key = createHash("sha256").update(`${contact.toLowerCase()}|${subject}|${today}`).digest("hex").slice(0, 32);
    await enqueueNotice({
      kind: "admin_waitlist",
      to: "admin",
      dedupeKey: `waitlist-aviso:${key}`,
      payload: { subject, name: name || undefined, contact: isEmail ? contact.toLowerCase() : phone },
    });
    await processOutbox(5).catch((cause) => console.error("Cola de mails", cause));
  });
  return NextResponse.json({ ok: true });
}
