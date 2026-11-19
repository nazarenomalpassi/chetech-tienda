"use client";

import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { OrderPayload } from "@/lib/commerce/types";
import { formatDateTime, formatPrice } from "@/lib/format";
import { trackEvent } from "@/lib/track";
import styles from "./order-actions.module.css";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.copyRow}>
      <span className={styles.copyLabel}>{label}</span>
      <span className={styles.copyValue}>{value}</span>
      <button
        type="button"
        className={styles.copyButton}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
          } catch {
            setCopied(false);
          }
        }}
        aria-label={`Copiar ${label}`}
      >
        {copied ? <Check aria-hidden size={18} /> : <Copy aria-hidden size={18} />}
        <span>{copied ? "Copiado" : "Copiar"}</span>
      </button>
    </div>
  );
}

export function OrderActions({
  order,
  token,
  paymentId,
  notice,
}: {
  order: OrderPayload;
  token: string | null;
  paymentId: string | null;
  notice: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(
    notice === "mp" ? "Tu pedido quedó reservado, pero no pudimos abrir Mercado Pago. Probá de nuevo." : null,
  );
  const polls = useRef(0);

  // Al volver de Mercado Pago: se consulta el pago y se refresca hasta que quede confirmado.
  useEffect(() => {
    if (!paymentId || order.status !== "awaiting_payment") return;
    let cancelled = false;
    const run = async () => {
      await fetch("/api/payments/mercadopago/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: order.order_number, token, paymentId }),
      }).catch(() => undefined);
      if (cancelled) return;
      router.refresh();
    };
    void run();
    const timer = window.setInterval(() => {
      polls.current += 1;
      if (polls.current > 12) window.clearInterval(timer);
      else router.refresh();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [paymentId, order.status, order.order_number, token, router]);

  // Medición de la compra: una sola vez por pedido, cuando el pago está aprobado.
  useEffect(() => {
    if (order.payment_status !== "approved") return;
    const key = `chetech-compra-medida-${order.order_number}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      return;
    }
    trackEvent("purchase", {
      value: order.total,
      transactionId: order.order_number,
      items: order.items.map((item) => ({ id: item.sku, name: item.name, price: item.unit_price, quantity: item.quantity })),
    });
  }, [order]);

  const reportTransfer = async () => {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/orders/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: order.order_number, token }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) setMessage(payload.error ?? "No pudimos registrar el aviso. Probá de nuevo.");
    else router.refresh();
  };

  const payAgain = async () => {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/payments/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: order.order_number, token }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; redirect?: string };
    if (response.ok && payload.redirect) {
      window.location.href = payload.redirect;
      return;
    }
    setBusy(false);
    setMessage(payload.error ?? "No pudimos abrir Mercado Pago. Probá de nuevo.");
  };

  if (order.status !== "awaiting_payment") {
    return message ? <p className={styles.message}>{message}</p> : null;
  }

  return (
    <div className={styles.box}>
      {order.payment_method === "transfer" && order.transfer ? (
        <>
          <p className={styles.lead}>
            Transferí <strong>{formatPrice(order.total)}</strong> antes del{" "}
            {order.reserved_until ? formatDateTime(order.reserved_until) : "vencimiento"}.
          </p>
          <div className={styles.copies}>
            {order.transfer.alias ? <CopyRow label="Alias" value={order.transfer.alias} /> : null}
            {order.transfer.cvu ? <CopyRow label="CBU o CVU" value={order.transfer.cvu} /> : null}
            <CopyRow label="Monto exacto" value={String(Math.round(order.total))} />
            {order.transfer.holder ? (
              <div className={styles.copyRow}>
                <span className={styles.copyLabel}>Titular</span>
                <span className={styles.copyValue}>
                  {order.transfer.holder}
                  {order.transfer.cuit ? `, CUIT ${order.transfer.cuit}` : ""}
                </span>
              </div>
            ) : null}
          </div>
          {order.transfer_reported_at ? (
            <p className={styles.ok}>Nos avisaste que transferiste. Lo confirmamos apenas veamos la acreditación.</p>
          ) : (
            <button type="button" className="btn" data-size="large" onClick={reportTransfer} disabled={busy || !token}>
              {busy ? "Avisando…" : "Ya transferí"}
            </button>
          )}
        </>
      ) : null}

      {order.payment_method === "mercadopago" ? (
        paymentId ? (
          <p className={styles.lead}>Estamos confirmando tu pago con Mercado Pago. Esta página se actualiza sola.</p>
        ) : (
          <>
            <p className={styles.lead}>
              Tu pedido está reservado hasta el {order.reserved_until ? formatDateTime(order.reserved_until) : "vencimiento"}.
              Pagalo para confirmarlo.
            </p>
            <button type="button" className="btn" data-size="large" onClick={payAgain} disabled={busy || !token}>
              {busy ? "Abriendo Mercado Pago…" : "Pagar con Mercado Pago"}
            </button>
          </>
        )
      ) : null}

      {order.payment_method === "pickup" ? (
        <p className={styles.lead}>
          Te avisamos por mail cuando esté listo. Lo pagás al retirar en el local: {formatPrice(order.total)}.
        </p>
      ) : null}

      {message ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
