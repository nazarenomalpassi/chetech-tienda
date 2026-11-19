import "server-only";

import { orderLink } from "@/lib/commerce/tokens";
import type { OrderPayload } from "@/lib/commerce/types";
import { renderMail, type MailKind } from "@/lib/mail/templates";
import { createServiceClient } from "@/lib/supabase/service";

const RESEND_API = "https://api.resend.com/emails";
const STALE_HOURS = 48;

export function mailEnabled() {
  return Boolean(process.env.RESEND_API_KEY);
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function sendMail(message: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Falta RESEND_API_KEY");
  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Idempotency-Key": message.idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? "CheTech <hola@chetechstore.com>",
      to: [message.to],
      reply_to: process.env.MAIL_REPLY_TO ?? "chetech.reparaciones@gmail.com",
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend ${response.status}: ${body.slice(0, 200)}`);
  }
}

type OutboxRow = {
  id: string;
  kind: string;
  order_id: string | null;
  recipient: string;
  dedupe_key: string;
  created_at: string;
};

/**
 * Manda los mails pendientes de la cola. Se llama después de cada compra, aviso de pago o acción de
 * Administración, y al abrir un pedido. Un mail que falla nunca frena un pago: queda en la cola y se
 * reintenta más tarde.
 */
export async function processOutbox(limit = 10) {
  if (!mailEnabled()) return { sent: 0, skipped: true };
  const service = createServiceClient();
  if (!service) return { sent: 0, skipped: true };

  const { data, error } = await service.rpc("storefront_claim_outbox", { p_limit: limit });
  if (error || !Array.isArray(data)) return { sent: 0, skipped: false };

  let sent = 0;
  for (const row of data as OutboxRow[]) {
    try {
      const isAdmin = row.recipient === "__admin__";
      const age = (Date.now() - new Date(row.created_at).getTime()) / 3_600_000;
      if (!isAdmin && age > STALE_HOURS && row.kind !== "review_request") {
        await service.rpc("storefront_skip_outbox", { p_id: row.id, p_reason: "Demasiado viejo para mandarlo" });
        continue;
      }
      if (!row.order_id) {
        await service.rpc("storefront_skip_outbox", { p_id: row.id, p_reason: "Sin pedido" });
        continue;
      }
      const { data: order } = await service.rpc("storefront_order_internal", { p_order_id: row.order_id });
      if (!order) {
        await service.rpc("storefront_skip_outbox", { p_id: row.id, p_reason: "Pedido no encontrado" });
        continue;
      }
      const payload = order as OrderPayload;
      const mail = await renderMail(row.kind as MailKind, payload, {
        order: orderLink(siteUrl(), payload),
        admin: `${siteUrl()}/admin/pedidos/${payload.id}`,
      });
      if (!mail) {
        await service.rpc("storefront_skip_outbox", { p_id: row.id, p_reason: `Tipo sin plantilla: ${row.kind}` });
        continue;
      }
      const to = isAdmin ? (process.env.ADMIN_EMAIL ?? "chetech.reparaciones@gmail.com") : row.recipient;
      await sendMail({ to, ...mail, idempotencyKey: row.dedupe_key });
      await service.rpc("storefront_finish_outbox", { p_id: row.id, p_ok: true, p_error: null });
      sent += 1;
    } catch (cause) {
      await service.rpc("storefront_finish_outbox", {
        p_id: row.id,
        p_ok: false,
        p_error: cause instanceof Error ? cause.message : "Error al mandar el mail",
      });
    }
  }
  return { sent, skipped: false };
}
