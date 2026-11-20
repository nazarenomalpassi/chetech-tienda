import "server-only";

import { getProducts } from "@/lib/catalog";
import { enqueueNotice, mailEnabled } from "@/lib/mail/outbox";
import { createServiceClient } from "@/lib/supabase/service";
import { waitlistAutoMatch, type WaitlistEntry } from "@/lib/waitlist-match";

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

/**
 * Avisa por mail a quienes dejaron su correo en la lista de espera y ya tienen el producto en stock
 * (ver waitlistAutoMatch: solo cuando no hay dudas de que es lo que pidieron). Los que dejaron WhatsApp
 * o pidieron algo puntual no reciben nada automático: aparecen marcados en Administración → Lista de
 * espera para escribirles a mano. Devuelve cuántos mails encoló.
 */
export async function notifyWaitlist(limit = 40) {
  if (!mailEnabled()) return 0;
  const service = createServiceClient();
  if (!service) return 0;

  const { data } = await service
    .from("storefront_waitlist")
    .select("id,kind,storefront_product_id,query,contact_name,email,phone,created_at,notified_at")
    .is("notified_at", null)
    .not("email", "is", null)
    .order("created_at")
    .limit(limit);
  const entries = (data ?? []) as WaitlistEntry[];
  if (!entries.length) return 0;

  const products = await getProducts();
  let queued = 0;
  for (const entry of entries) {
    const product = waitlistAutoMatch(entry, products);
    if (!product || !entry.email) continue;
    const image = product.image?.startsWith("http")
      ? product.image
      : product.image
        ? `${siteUrl()}${product.image}`
        : undefined;
    const ok = await enqueueNotice({
      kind: "back_in_stock",
      to: entry.email,
      dedupeKey: `waitlist:${entry.id}`,
      payload: {
        name: entry.contact_name ?? undefined,
        productName: product.name,
        productPath: `/productos/${product.slug}`,
        productPrice: product.price,
        productImage: image,
      },
    });
    if (!ok) continue;
    // Recién después de encolar el mail se marca como avisado: si algo falla antes, se reintenta.
    await service
      .from("storefront_waitlist")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", entry.id);
    queued += 1;
  }
  return queued;
}
