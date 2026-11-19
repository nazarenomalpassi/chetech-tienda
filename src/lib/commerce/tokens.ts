import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// La clave de acceso a un pedido sale de su identificador y de un secreto del servidor. La base solo
// guarda su huella, así que quien lea la base no puede abrir pedidos, y el servidor puede volver a
// armar el enlace para los mails sin guardarlo en ningún lado.
function secret() {
  const value = process.env.CHECKOUT_ACCESS_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Falta CHECKOUT_ACCESS_SECRET (o SUPABASE_ROOT_SECRET para derivarla).");
  }
  return "solo-para-desarrollo-local-no-usar-en-produccion";
}

export function newOrderId() {
  return randomUUID();
}

export function accessTokenFor(orderId: string) {
  return createHmac("sha256", secret()).update(`pedido:${orderId}`).digest("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function orderLink(siteUrl: string, order: { id: string; order_number: string }) {
  return `${siteUrl.replace(/\/$/, "")}/pedido/${encodeURIComponent(order.order_number)}?t=${accessTokenFor(order.id)}`;
}
