import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { deliveryMethodLabels } from "@/lib/orders";
import { cleanWhatsAppText, whatsappUrl } from "@/lib/whatsapp";

type RequestedItem = { id: string; quantity: number; expectedPrice: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json"))
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 415 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin)
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 403 });
  let body: { items?: unknown; details?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 25)
    return NextResponse.json({ message: "El carrito no es válido." }, { status: 400 });
  const items: RequestedItem[] = body.items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const quantity = Number(row.quantity);
    const expectedPrice = Number(row.expectedPrice);
    return uuid.test(id) &&
      Number.isInteger(quantity) &&
      quantity >= 1 &&
      quantity <= 99 &&
      Number.isFinite(expectedPrice) &&
      expectedPrice >= 0
      ? [{ id, quantity, expectedPrice }]
      : [];
  });
  if (
    items.length !== body.items.length ||
    new Set(items.map((item) => item.id)).size !== items.length
  )
    return NextResponse.json({ message: "El carrito contiene datos inválidos." }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (!userId)
    return NextResponse.json(
      { message: "Iniciá sesión para finalizar el pedido.", loginUrl: "/ingresar?next=/carrito" },
      { status: 401 },
    );
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name,last_name,full_name,phone,email_verified,account_status")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.account_status !== "active")
    return NextResponse.json(
      { message: "La cuenta no está habilitada para crear pedidos." },
      { status: 403 },
    );
  if (!profile.email_verified)
    return NextResponse.json(
      { message: "Verificá tu correo antes de crear el pedido." },
      { status: 403 },
    );

  const details = body.details ?? {};
  const deliveryMethod = ["shipping", "pickup", "coordinate"].includes(
    String(details.deliveryMethod),
  )
    ? String(details.deliveryMethod)
    : "coordinate";
  const customerName = cleanWhatsAppText(
    details.name || profile.full_name || `${profile.first_name ?? ""} ${profile.last_name ?? ""}`,
    160,
  );
  const customerPhone = cleanWhatsAppText(details.phone || profile.phone, 40);
  const customerNotes = cleanWhatsAppText(details.notes, 1000);
  const addressId =
    typeof details.addressId === "string" && uuid.test(details.addressId)
      ? details.addressId
      : null;
  if (!customerName || !customerPhone)
    return NextResponse.json(
      { message: "Completá nombre y teléfono para continuar." },
      { status: 400 },
    );
  if (deliveryMethod === "shipping" && !addressId)
    return NextResponse.json({ message: "Elegí una dirección de envío." }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key)
    return NextResponse.json({ message: "No pudimos verificar el catálogo." }, { status: 503 });
  const catalog = createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: currentRows, error: catalogError } = await catalog.rpc("get_storefront_products", {
    p_ids: items.map((item) => item.id),
    p_slugs: null,
  });
  const currentProducts = Array.isArray(currentRows)
    ? (currentRows as Array<Record<string, unknown>>)
    : [];
  if (
    catalogError ||
    currentProducts.length !== items.length ||
    currentProducts.some((product) => product.availability_label === "Sin stock")
  ) {
    return NextResponse.json(
      { message: "Uno o más productos cambiaron o ya no están disponibles. Actualizá el carrito." },
      { status: 409 },
    );
  }
  const currentById = new Map(
    currentProducts.map((product) => [String(product.id), Number(product.public_price)]),
  );
  const changedPrices = items.filter((item) => currentById.get(item.id) !== item.expectedPrice);
  if (changedPrices.length)
    return NextResponse.json(
      {
        code: "PRICE_CHANGED",
        message:
          "Detectamos cambios de precio. Actualizá el carrito para revisar los importes antes de continuar.",
      },
      { status: 409 },
    );

  const { data: created, error } = await supabase.rpc("create_storefront_order", {
    p_items: items.map(({ id, quantity }) => ({ id, quantity })),
    p_delivery_method: deliveryMethod,
    p_shipping_address_id: addressId,
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
    p_customer_notes: customerNotes || null,
  });
  if (error || !created || typeof created !== "object") {
    const unavailable = error?.message?.includes("products_changed_or_unavailable");
    return NextResponse.json(
      {
        message: unavailable
          ? "Uno o más productos ya no tienen stock suficiente. Actualizá el carrito."
          : "No pudimos crear el pedido. Intentá nuevamente.",
      },
      { status: unavailable ? 409 : 500 },
    );
  }

  const order = created as Record<string, unknown>;
  const orderItems = Array.isArray(order.items)
    ? (order.items as Array<Record<string, unknown>>)
    : [];
  const lines = orderItems.flatMap((item, index) => [
    `${index + 1}. ${cleanWhatsAppText(item.name, 160)}`,
    `   SKU: ${cleanWhatsAppText(item.sku, 80)}`,
    `   Cantidad: ${Number(item.quantity)}`,
    `   Precio unitario: ${formatPrice(Number(item.unit_price))}`,
    `   Subtotal: ${formatPrice(Number(item.subtotal))}`,
    "",
  ]);
  const message = [
    `Hola, Chetech. Generé el pedido #${cleanWhatsAppText(order.order_number, 40)} desde la tienda.`,
    "",
    ...lines,
    `Total estimado: ${formatPrice(Number(order.total))}`,
    "Costo de envío a confirmar según destino.",
    "",
    `Modalidad: ${deliveryMethodLabels[deliveryMethod]}`,
    `Nombre: ${customerName}`,
    customerNotes ? `Observaciones: ${customerNotes}` : "",
    "",
    "El pedido está pendiente de confirmación de stock, pago y entrega por parte de Chetech.",
  ]
    .filter(Boolean)
    .join("\n");

  return NextResponse.json(
    { url: whatsappUrl(message), orderNumber: order.order_number },
    { headers: { "Cache-Control": "no-store" } },
  );
}
