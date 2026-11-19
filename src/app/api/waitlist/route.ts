import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { rateLimit } from "@/lib/rate-limit";

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
  const kind = ["product", "refurbished", "board"].includes(String(body.kind)) ? String(body.kind) : "product";
  const { error } = await service.rpc("storefront_join_waitlist", {
    p_input: {
      kind,
      storefront_product_id: typeof body.storefront_product_id === "string" ? body.storefront_product_id : null,
      query: String(body.query ?? "").slice(0, 200),
      name: String(body.name ?? "").slice(0, 120),
      email: isEmail ? contact.toLowerCase() : null,
      phone: isEmail ? null : phone,
      consent: true,
    },
  });
  if (error) return NextResponse.json({ error: "No pudimos guardar tus datos. Probá de nuevo." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
