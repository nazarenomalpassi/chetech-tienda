import "server-only";

import { NextResponse } from "next/server";

// Límite simple por IP en memoria. Alcanza para una sola réplica (la tienda corre con una).
const buckets = new Map<string, { count: number; reset: number }>();

export function clientIp(request: Request) {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "desconocida"
  );
}

export function rateLimit(request: Request, scope: string, limit: number, windowMs: number) {
  const key = `${scope}:${clientIp(request)}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 5000) {
      for (const [entry, value] of buckets) if (value.reset < now) buckets.delete(entry);
    }
    return null;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return NextResponse.json(
      { error: "Demasiados intentos. Esperá un minuto y probá de nuevo." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((bucket.reset - now) / 1000)) } },
    );
  }
  return null;
}
