import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminOrderForm } from "@/components/admin-forms";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatPrice, formatShortDateTime } from "@/lib/format";
import {
  deliveryMethodLabels,
  orderStatusLabels,
  orderTone,
  paymentMethodLabels,
  paymentStatusLabels,
} from "@/lib/orders";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { customerWhatsAppUrl } from "@/lib/whatsapp";
import { OrderAdminActions, OrderNotes, type AdminOrderSummary } from "../order-admin-actions";
import styles from "../orders.module.css";

type ItemRow = {
  id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  quantity: number;
  unit_price_snapshot: number | string;
  subtotal: number | string;
};

type HistoryRow = {
  id: string;
  previous_status: string | null;
  new_status: string;
  customer_visible_note: string | null;
  created_at: string;
};

type PaymentRow = {
  id: string;
  provider: string;
  provider_payment_id: string | null;
  status: string;
  status_detail: string | null;
  amount: number | string;
  created_at: string;
};

type Address = {
  street?: string;
  number?: string;
  street_number?: string;
  apartment?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  notes?: string;
};

function addressLine(address: Address | null) {
  if (!address) return null;
  const street = [address.street, address.number ?? address.street_number].filter(Boolean).join(" ");
  return [
    [street, address.apartment].filter(Boolean).join(", "),
    [address.city, address.province, address.postal_code].filter(Boolean).join(", "),
    address.notes,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("/admin/pedidos");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createServerSupabaseClient();
  const [{ data: order }, { data: history }, { data: payments }] = await Promise.all([
    supabase.from("storefront_orders").select("*,storefront_order_items(*)").eq("id", id).maybeSingle(),
    supabase
      .from("storefront_order_status_history")
      .select("id,previous_status,new_status,customer_visible_note,created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("storefront_payments")
      .select("id,provider,provider_payment_id,status,status_detail,amount,created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!order) notFound();

  const sale = order.gestion_sale_id
    ? (await supabase.from("sales").select("sale_number").eq("id", order.gestion_sale_id).maybeSingle()).data
    : null;

  const items = (Array.isArray(order.storefront_order_items) ? order.storefront_order_items : []) as ItemRow[];
  const isLegacy = !order.payment_method;
  const summary: AdminOrderSummary = {
    id: order.id,
    status: order.status,
    payment_method: order.payment_method,
    payment_status: order.payment_status,
    delivery_method: order.delivery_method,
    transfer_reported_at: order.transfer_reported_at,
    needs_attention: order.needs_attention,
    admin_notes: order.admin_notes,
  };
  const phone = String(order.customer_phone_snapshot ?? "").replace(/\D/g, "");
  const address = addressLine(order.shipping_address_snapshot as Address | null);
  const deliveryLabel =
    (order.delivery_option as { label?: string } | null)?.label ??
    deliveryMethodLabels[order.delivery_method] ??
    order.delivery_method;

  return (
    <>
      <Link className={styles.back} href="/admin/pedidos">
        Volver a pedidos
      </Link>
      <div className={styles.head}>
        <div>
          <h1>{order.order_number}</h1>
          <p>
            <span className={styles.status} data-tone={orderTone(order.status, order.needs_attention)}>
              {orderStatusLabels[order.status] ?? order.status}
            </span>{" "}
            · Hecho el {formatDateTime(order.created_at)}
          </p>
        </div>
        {phone ? (
          <a
            className="btn"
            data-variant="whatsapp"
            href={customerWhatsAppUrl(phone, `Hola ${order.customer_name_snapshot}, te escribimos de CheTech por tu pedido ${order.order_number}.`)}
            target="_blank"
            rel="noreferrer"
          >
            Escribirle por WhatsApp
          </a>
        ) : null}
      </div>

      {order.needs_attention ? (
        <div className={styles.alert} role="alert">
          <p>
            <strong>Revisar:</strong> {order.needs_attention}
          </p>
        </div>
      ) : null}

      <div className={styles.grid}>
        <div>
          <section className={styles.panel}>
            <h2>Productos</h2>
            <ul className={styles.items}>
              {items.map((item) => (
                <li key={item.id}>
                  <div>
                    {item.product_name_snapshot}
                    <small>
                      {item.sku_snapshot} · {item.quantity} × {formatPrice(Number(item.unit_price_snapshot))}
                    </small>
                  </div>
                  <strong>{formatPrice(Number(item.subtotal))}</strong>
                </li>
              ))}
            </ul>
            <dl className={styles.sum}>
              <dt>Productos</dt>
              <dd>{formatPrice(Number(order.subtotal))}</dd>
              <dt>Entrega</dt>
              <dd>{Number(order.shipping_cost) > 0 ? formatPrice(Number(order.shipping_cost)) : "Sin cargo"}</dd>
              {Number(order.discount_total) > 0 ? (
                <>
                  <dt>Descuento</dt>
                  <dd>−{formatPrice(Number(order.discount_total))}</dd>
                </>
              ) : null}
              <dt className={styles.grand}>Total</dt>
              <dd className={styles.grand}>{formatPrice(Number(order.total))}</dd>
            </dl>
          </section>

          <section className={styles.panel}>
            <h2>Cliente y entrega</h2>
            <dl className={styles.facts}>
              <dt>Nombre</dt>
              <dd>{order.customer_name_snapshot}</dd>
              <dt>Mail</dt>
              <dd>
                <a href={`mailto:${order.customer_email_snapshot}`}>{order.customer_email_snapshot}</a>
              </dd>
              <dt>WhatsApp</dt>
              <dd>{order.customer_phone_snapshot}</dd>
              <dt>Cuenta</dt>
              <dd>{order.user_id ? "Cliente con cuenta" : "Compra sin cuenta"}</dd>
              <dt>Entrega</dt>
              <dd>{deliveryLabel}</dd>
              {address ? (
                <>
                  <dt>Dirección</dt>
                  <dd>{address}</dd>
                </>
              ) : null}
              {order.pickup_code ? (
                <>
                  <dt>Código de retiro</dt>
                  <dd>
                    <strong>{order.pickup_code}</strong>
                  </dd>
                </>
              ) : null}
              {order.tracking_code ? (
                <>
                  <dt>Seguimiento</dt>
                  <dd>
                    {order.tracking_url ? (
                      <a href={order.tracking_url} target="_blank" rel="noreferrer">
                        {order.tracking_code}
                      </a>
                    ) : (
                      order.tracking_code
                    )}
                  </dd>
                </>
              ) : null}
              <dt>Comentario</dt>
              <dd>{order.customer_notes || "Sin comentarios"}</dd>
              <dt>Llegó desde</dt>
              <dd>
                {[order.attribution?.source, order.attribution?.campaign, order.attribution?.content]
                  .filter(Boolean)
                  .join(" · ") || "Directo"}
              </dd>
            </dl>
          </section>

          <section className={styles.panel}>
            <h2>Historial</h2>
            <ol className={styles.timeline}>
              {(history as HistoryRow[] | null)?.map((entry) => (
                <li key={entry.id}>
                  <time dateTime={entry.created_at}>{formatShortDateTime(entry.created_at)}</time>
                  <strong>{orderStatusLabels[entry.new_status] ?? entry.new_status}</strong>
                  {entry.customer_visible_note ? <span>{entry.customer_visible_note}</span> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div>
          <section className={styles.panel}>
            <h2>Cobro</h2>
            <dl className={styles.facts}>
              <dt>Medio</dt>
              <dd>{order.payment_method ? paymentMethodLabels[order.payment_method] : "A coordinar por WhatsApp"}</dd>
              <dt>Estado</dt>
              <dd>{paymentStatusLabels[order.payment_status] ?? order.payment_status}</dd>
              {order.status === "awaiting_payment" && order.reserved_until ? (
                <>
                  <dt>Reserva</dt>
                  <dd>Hasta el {formatDateTime(order.reserved_until)}</dd>
                </>
              ) : null}
              {order.transfer_reported_at ? (
                <>
                  <dt>Aviso del cliente</dt>
                  <dd>Transfirió el {formatDateTime(order.transfer_reported_at)}</dd>
                </>
              ) : null}
              {order.paid_at ? (
                <>
                  <dt>Cobrado</dt>
                  <dd>{formatDateTime(order.paid_at)}</dd>
                </>
              ) : null}
              <dt>Venta en la gestión</dt>
              <dd>{sale?.sale_number ?? (order.payment_status === "approved" ? "Sin registrar" : "Se registra al cobrar")}</dd>
            </dl>
            {(payments as PaymentRow[] | null)?.length ? (
              <ul className={styles.items} style={{ marginTop: "var(--space-4)" }}>
                {(payments as PaymentRow[]).map((payment) => (
                  <li key={payment.id}>
                    <div>
                      {paymentMethodLabels[payment.provider] ?? payment.provider} ·{" "}
                      {paymentStatusLabels[payment.status] ?? payment.status}
                      <small>
                        {formatShortDateTime(payment.created_at)}
                        {payment.provider_payment_id ? ` · operación ${payment.provider_payment_id}` : ""}
                        {payment.status_detail ? ` · ${payment.status_detail}` : ""}
                      </small>
                    </div>
                    <strong>{formatPrice(Number(payment.amount))}</strong>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className={styles.panel}>
            <h2>Qué sigue</h2>
            {isLegacy ? <AdminOrderForm order={order} /> : <OrderAdminActions order={summary} />}
          </section>

          {!isLegacy ? (
            <section className={styles.panel}>
              <h2>Nota interna</h2>
              <OrderNotes order={summary} />
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
