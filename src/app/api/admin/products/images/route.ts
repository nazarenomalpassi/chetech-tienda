import { randomUUID } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOREFRONT_CATALOG_TAG } from "@/lib/catalog";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const types: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin)
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 403 });
  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (!userId) return NextResponse.json({ message: "Sesión requerida." }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role,account_status")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.role !== "admin" || profile.account_status !== "active")
    return NextResponse.json({ message: "Permiso denegado." }, { status: 403 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ message: "Archivo inválido." }, { status: 400 });
  }
  const file = formData.get("file");
  const productId = String(formData.get("productId") ?? "");
  const alt = String(formData.get("alt") ?? "")
    .trim()
    .slice(0, 200);
  const isPrimary = formData.get("isPrimary") === "true";
  if (!(file instanceof File) || !uuid.test(productId) || !alt)
    return NextResponse.json(
      { message: "Completá archivo, producto y texto alternativo." },
      { status: 400 },
    );
  if (!types[file.type] || file.size < 1 || file.size > 5 * 1024 * 1024)
    return NextResponse.json({ message: "Usá JPG, PNG o WebP de hasta 5 MB." }, { status: 400 });
  const { data: product } = await supabase
    .from("storefront_products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();
  if (!product) return NextResponse.json({ message: "Producto no encontrado." }, { status: 404 });

  let optimizedImage: Buffer;
  try {
    const pipeline = sharp(Buffer.from(await file.arrayBuffer()), {
      animated: false,
      limitInputPixels: 40_000_000,
    });
    const metadata = await pipeline.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > 12_000 ||
      metadata.height > 12_000
    ) {
      return NextResponse.json(
        { message: "La imagen no tiene dimensiones válidas." },
        { status: 400 },
      );
    }
    optimizedImage = await pipeline
      .rotate()
      .resize({ width: 1_600, height: 1_600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84, effort: 5 })
      .toBuffer();
  } catch {
    return NextResponse.json(
      { message: "El archivo no contiene una imagen válida." },
      { status: 400 },
    );
  }

  const path = `${productId}/${Date.now()}-${randomUUID()}.webp`;
  const uploaded = await supabase.storage.from("storefront-products").upload(path, optimizedImage, {
    contentType: "image/webp",
    upsert: false,
    cacheControl: "31536000",
  });
  if (uploaded.error)
    return NextResponse.json({ message: "No pudimos cargar la imagen." }, { status: 500 });
  const publicUrl = supabase.storage.from("storefront-products").getPublicUrl(path).data.publicUrl;
  const registered = await supabase.rpc("register_storefront_product_image", {
    p_product_id: productId,
    p_storage_path: path,
    p_public_url: publicUrl,
    p_alt_text: alt,
    p_is_primary: isPrimary,
  });
  if (registered.error || !registered.data) {
    await supabase.storage.from("storefront-products").remove([path]);
    return NextResponse.json({ message: "No pudimos registrar la imagen." }, { status: 500 });
  }
  revalidateTag(STOREFRONT_CATALOG_TAG);
  return NextResponse.json({ id: registered.data, publicUrl }, { status: 201 });
}
