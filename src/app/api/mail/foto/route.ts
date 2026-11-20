import sharp from "sharp";
import { rateLimit } from "@/lib/rate-limit";

// Fotos de producto para los mails: la misma foto de la tienda, cuadrada, sobre blanco y en JPEG.
// Las fotos de la tienda son WebP y Outlook de escritorio no muestra WebP. Solo acepta fotos del
// almacenamiento de la propia tienda: no sirve para traer imágenes de otros sitios.

const sizes = new Set([112, 480]);

function allowed(raw: string | null) {
  if (!raw) return null;
  const storage = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!storage) return null;
  try {
    const url = new URL(raw);
    const base = new URL(storage);
    if (url.protocol !== "https:" || url.host !== base.host) return null;
    if (!url.pathname.startsWith("/storage/v1/object/public/")) return null;
    return url;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "mail-foto", 240, 60_000);
  if (limited) return limited;
  const params = new URL(request.url).searchParams;
  const source = allowed(params.get("u"));
  const size = Number(params.get("s") ?? 112);
  if (!source || !sizes.has(size)) return new Response("No encontrada", { status: 404 });

  const upstream = await fetch(source, { signal: AbortSignal.timeout(8_000) }).catch(() => null);
  if (!upstream?.ok) return new Response("No encontrada", { status: 404 });
  const length = Number(upstream.headers.get("content-length") ?? 0);
  if (length > 15_000_000) return new Response("Muy grande", { status: 413 });

  try {
    const input = Buffer.from(await upstream.arrayBuffer());
    const output = await sharp(input)
      .resize(size, size, { fit: "contain", background: "#ffffff" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return new Response(new Uint8Array(output), {
      headers: {
        "Content-Type": "image/jpeg",
        // La dirección de cada foto cambia si cambia la foto: se puede guardar para siempre.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("No encontrada", { status: 404 });
  }
}
