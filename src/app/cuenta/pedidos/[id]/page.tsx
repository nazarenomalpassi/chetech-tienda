import { notFound, redirect } from "next/navigation";
import { formatDate } from "@/lib/date";
import { formatPrice } from "@/lib/format";
import { deliveryMethodLabels, orderStatusLabels } from "@/lib/orders";
import { requireAccount } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AccountHeading } from "../../account-heading";
import styles from "../../account.module.css";

type OrderItemRow = {
  id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  quantity: number;
  unit_price_snapshot: number | string;
  subtotal: number | string;
};

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await requireAccount();
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const [{ data: order }, { data: history }] = await Promise.all([
    supabase
      .from("storefront_orders")
      .select("*,storefront_order_items(*)")
      .eq("id", id)
      .eq("user_id", account.id)
      .maybeSingle(),
    supabase
      .from("storefront_order_status_history")
      .select("id,new_status,customer_visible_note,created_at")
      .eq("order_id", id)
      .not("customer_visible_note", "is", null)
      .order("created_at", { ascending: false }),
  ]);
  if (!order) notFound();
  // Los pedidos de la compra nueva tienen su propia página, con pago, retiro y seguimiento.
  if (order.payment_method) redirect(`/pedido/${encodeURIComponent(order.order_number)}`);
  const items = (
    Array.isArray(order.storefront_order_items) ? order.storefront_order_items : []
  ) as OrderItemRow[];
  return (
    <>
      <AccountHeading title={`Pedido ${order.order_number}`} back={{ href: "/cuenta/pedidos", label: "Volver a pedidos" }}>
        {formatDate(order.created_at, { dateStyle: "long", timeStyle: "short" })}
      </AccountHeading>
      <dl className={styles.summary}>
        <div>
          <dt>Estado</dt>
          <dd>{orderStatusLabels[order.status] ?? order.status}</dd>
        </div>
        <div>
          <dt>Entrega</dt>
          <dd>{deliveryMethodLabels[order.delivery_method] ?? order.delivery_method}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{formatPrice(Number(order.total))}</dd>
        </div>
      </dl>
      <ul className={styles.rows}>
        {items.map((item) => (
          <li key={item.id} className={styles.row}>
            <span className={styles.rowTitle}>{item.product_name_snapshot}</span>
            <span className={styles.rowMeta}>
              {item.quantity} × {formatPrice(Number(item.unit_price_snapshot))}
            </span>
            <span className={styles.rowSide}>
              <strong>{formatPrice(Number(item.subtotal))}</strong>
            </span>
          </li>
        ))}
      </ul>
      {history?.length ? (
        <section className={styles.block} aria-labelledby="novedades">
          <div className={styles.blockHead}>
            <h2 id="novedades">Novedades</h2>
          </div>
          {history.map((entry) => (
            <div className={styles.note} key={entry.id}>
              <strong>{orderStatusLabels[entry.new_status] ?? "Novedad"}</strong>
              <time dateTime={entry.created_at}>{formatDate(entry.created_at, { dateStyle: "medium", timeStyle: "short" })}</time>
              <p>{entry.customer_visible_note}</p>
            </div>
          ))}
        </section>
      ) : null}
      {order.customer_notes ? (
        <div className={styles.note}>
          <strong>Tu nota</strong>
          <p>{order.customer_notes}</p>
        </div>
      ) : null}
    </>
  );
}
