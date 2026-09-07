import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const allowedTypes = new Set(["withdrawal", "privacy"]);
const allowedChannels = new Set(["email", "whatsapp", "phone"]);
const allowedRights = new Set([
  "access",
  "rectification",
  "deletion",
  "information",
  "consent",
  "",
]);

function text(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/json"))
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 415 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin)
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 403 });

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  const requestType = text(input.requestType, 20);
  const firstName = text(input.firstName, 80);
  const lastName = text(input.lastName, 80);
  const contact = text(input.contact, 160);
  const preferredChannel = text(input.preferredChannel, 20);
  const orderReference = text(input.orderReference, 80);
  const approximateDate = text(input.approximateDate, 10);
  const product = text(input.product, 200);
  const reason = text(input.reason, 1000);
  const privacyRight = text(input.privacyRight, 30);
  const honeypot = text(input.website, 50);

  if (honeypot) return NextResponse.json({ message: "Solicitud recibida." }, { status: 202 });
  if (
    !allowedTypes.has(requestType) ||
    !firstName ||
    !lastName ||
    !contact ||
    !allowedChannels.has(preferredChannel)
  )
    return NextResponse.json({ message: "Revisá los campos obligatorios." }, { status: 400 });
  if (requestType === "withdrawal" && !product)
    return NextResponse.json({ message: "Indicá el producto relacionado." }, { status: 400 });
  if (requestType === "privacy" && (!allowedRights.has(privacyRight) || !privacyRight || !reason))
    return NextResponse.json(
      { message: "Indicá el tipo y detalle de la solicitud." },
      { status: 400 },
    );
  if (approximateDate && !/^\d{4}-\d{2}-\d{2}$/.test(approximateDate))
    return NextResponse.json({ message: "La fecha no es válida." }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hashSalt = process.env.LEGAL_REQUEST_HASH_SALT;
  if (!supabaseUrl || !publishableKey || !hashSalt)
    return NextResponse.json(
      { message: "El canal web no está disponible temporalmente." },
      { status: 503 },
    );

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const fingerprint = createHmac("sha256", hashSalt)
    .update(`${forwarded}|${request.headers.get("user-agent") ?? ""}`)
    .digest("hex");
  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("submit_consumer_request", {
    p_request_type: requestType,
    p_first_name: firstName,
    p_last_name: lastName,
    p_contact: contact,
    p_preferred_channel: preferredChannel,
    p_server_token: hashSalt,
    p_order_reference: orderReference || null,
    p_approximate_date: approximateDate || null,
    p_product: product || null,
    p_reason: reason || null,
    p_privacy_right: privacyRight || null,
    p_fingerprint_hash: fingerprint,
  });
  if (error)
    return NextResponse.json(
      {
        message:
          error.code === "P0001"
            ? "Superaste temporalmente el límite de solicitudes. Intentá nuevamente más tarde."
            : error.code === "22023"
              ? "Revisá los datos enviados."
              : "No pudimos registrar la solicitud.",
      },
      { status: error.code === "P0001" ? 429 : error.code === "22023" ? 400 : 503 },
    );
  const payload =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as { reference?: string })
      : {};
  if (!payload.reference)
    return NextResponse.json({ message: "No pudimos generar la constancia." }, { status: 503 });
  return NextResponse.json(
    { reference: payload.reference },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
