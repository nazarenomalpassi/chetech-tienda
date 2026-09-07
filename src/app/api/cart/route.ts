import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapProduct } from "@/lib/catalog";

type RequestedItem = { id: string; quantity: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseItems(input: unknown): RequestedItem[] | null {
  if (!Array.isArray(input) || input.length > 25) return null;
  const parsed = input.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const quantity = Number(row.quantity);
    return uuid.test(id) && Number.isInteger(quantity) && quantity >= 1 && quantity <= 99
      ? [{ id, quantity }]
      : [];
  });
  return parsed.length === input.length &&
    new Set(parsed.map((item) => item.id)).size === parsed.length
    ? parsed
    : null;
}

function publicCatalogClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

export async function PUT(request: NextRequest) {
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json"))
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 415 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin)
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 403 });
  let body: { items?: unknown; mode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }
  const requested = parseItems(body.items);
  const mode = body.mode === "replace" ? "replace" : "merge";
  if (!requested) return NextResponse.json({ message: "Carrito inválido." }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (!userId)
    return NextResponse.json(
      { message: "Iniciá sesión para guardar el carrito." },
      { status: 401 },
    );

  const { data: cart, error: cartError } = await supabase
    .from("storefront_carts")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (cartError)
    return NextResponse.json({ message: "No pudimos consultar el carrito." }, { status: 500 });
  const stored = cart
    ? await supabase
        .from("storefront_cart_items")
        .select("storefront_product_id,quantity")
        .eq("cart_id", cart.id)
    : { data: [], error: null };
  if (stored.error)
    return NextResponse.json({ message: "No pudimos consultar el carrito." }, { status: 500 });
  const storedRows = stored.data;
  const quantities = new Map<string, number>();
  if (mode === "merge")
    (storedRows ?? []).forEach((row) =>
      quantities.set(String(row.storefront_product_id), Number(row.quantity)),
    );
  requested.forEach((item) =>
    quantities.set(
      item.id,
      mode === "merge"
        ? Math.min(99, Math.max(quantities.get(item.id) ?? 0, item.quantity))
        : item.quantity,
    ),
  );

  const catalog = publicCatalogClient();
  if (!catalog)
    return NextResponse.json({ message: "No pudimos verificar el catálogo." }, { status: 503 });
  const ids = [...quantities.keys()];
  const { data: productRows, error: productError } = ids.length
    ? await catalog.rpc("get_storefront_products", { p_ids: ids, p_slugs: null })
    : { data: [], error: null };
  if (productError)
    return NextResponse.json({ message: "No pudimos verificar el catálogo." }, { status: 503 });
  const products = (Array.isArray(productRows) ? productRows : [])
    .map((row) => mapProduct(row as Record<string, unknown>))
    .filter((product) => product.status !== "Sin stock");
  const validIds = new Set(products.map((product) => product.id));

  const finalItems = products.map((product) => ({
    id: product.id,
    quantity: quantities.get(product.id) ?? 1,
  }));
  const { error: syncError } = await supabase.rpc("sync_storefront_cart", {
    p_items: finalItems,
  });
  if (syncError) {
    return NextResponse.json(
      { message: "No pudimos sincronizar el carrito." },
      { status: syncError.code === "P0001" ? 409 : 500 },
    );
  }

  return NextResponse.json(
    {
      items: products.map((product) => ({ product, quantity: quantities.get(product.id) ?? 1 })),
      removed: ids.filter((id) => !validIds.has(id)),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
