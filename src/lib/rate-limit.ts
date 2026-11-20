import "server-only";

import { headers } from "next/headers";
import { NextResponse } from "next/server";

// Límite simple por IP en memoria. Alcanza para una sola réplica (la tienda corre con una).
const buckets = new Map<string, { count: number; reset: number }>();

function ipFrom(get: (name: string) => string | null) {
  return get("x-real-ip") ?? get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconocida";
}

export function clientIp(request: Request) {
  return ipFrom((name) => request.headers.get(name));
}

/** Cuenta un intento. Devuelve 0 si puede seguir, o los segundos que faltan si ya pasó el límite. */
function hit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 5000) {
      for (const [entry, value] of buckets) if (value.reset < now) buckets.delete(entry);
    }
    return 0;
  }
  bucket.count += 1;
  return bucket.count > limit ? Math.max(1, Math.ceil((bucket.reset - now) / 1000)) : 0;
}

export function rateLimit(request: Request, scope: string, limit: number, windowMs: number) {
  const wait = hit(`${scope}:${clientIp(request)}`, limit, windowMs);
  if (!wait) return null;
  return NextResponse.json(
    { error: "Demasiados intentos. Esperá un minuto y probá de nuevo." },
    { status: 429, headers: { "Retry-After": String(wait) } },
  );
}

/**
 * Lo mismo para acciones de formulario (ingreso, registro, recuperar contraseña), que no reciben el
 * pedido: toma la IP de los encabezados. Devuelve el mensaje para mostrar, o null si puede seguir.
 */
export async function limitAction(scope: string, limit: number, windowMs: number) {
  const store = await headers();
  const ip = ipFrom((name) => store.get(name));
  // Sin IP no se puede distinguir a nadie: mejor no frenar que frenar a todos juntos.
  if (ip === "desconocida") return null;
  const wait = hit(`${scope}:${ip}`, limit, windowMs);
  if (!wait) return null;
  const minutes = Math.ceil(wait / 60);
  return `Demasiados intentos seguidos. Esperá ${minutes === 1 ? "un minuto" : `${minutes} minutos`} y probá de nuevo.`;
}
