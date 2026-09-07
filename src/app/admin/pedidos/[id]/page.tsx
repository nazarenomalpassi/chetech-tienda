import { notFound } from "next/navigation";
import { AdminOrderForm } from "@/components/admin-forms";
import { formatDate } from "@/lib/date";
import { formatPrice } from "@/lib/format";
import { deliveryMethodLabels, orderStatusLabels } from "@/lib/orders";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type OrderItemRow = {
  id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  quantity: number;
  subtotal: number | string;
};

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const [{ data: order }, { data: history }] = await Promise.all([
    supabase
      .from("storefront_orders")
      .select("*,storefront_order_items(*)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("storefront_order_status_history")
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!order) notFound();
  const items = (
    Array.isArray(order.storefront_order_items) ? order.storefront_order_items : []
  ) as OrderItemRow[];
  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">{order.order_number}</p>
        <h1>Detalle del pedido</h1>
        <p>
          {orderStatusLabels[order.status]} · {deliveryMethodLabels[order.delivery_method]}
        </p>
      </div>
      <div className="admin-order-grid">
        <section className="admin-panel">
          <h2>Cliente y entrega</h2>
          <dl>
            <dt>Nombre</dt>
            <dd>{order.customer_name_snapshot}</dd>
            <dt>Correo</dt>
            <dd>{order.customer_email_snapshot}</dd>
            <dt>Teléfono</dt>
            <dd>{order.customer_phone_snapshot}</dd>
            <dt>Modalidad</dt>
            <dd>{deliveryMethodLabels[order.delivery_method]}</dd>
            <dt>Dirección</dt>
            <dd>
              {order.shipping_address_snapshot
                ? `${order.shipping_address_snapshot.street} ${order.shipping_address_snapshot.street_number}, ${order.shipping_address_snapshot.city}, ${order.shipping_address_snapshot.province}`
                : "No corresponde"}
            </dd>
            <dt>Observaciones</dt>
            <dd>{order.customer_notes || "Sin observaciones"}</dd>
          </dl>
        </section>
        <section className="admin-panel">
          <h2>Productos</h2>
          <div className="admin-order-items">
            {items.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.product_name_snapshot}</strong>
                  <span>
                    {item.sku_snapshot} · {item.quantity} unidades
                  </span>
                </div>
                <strong>{formatPrice(Number(item.subtotal))}</strong>
              </article>
            ))}
          </div>
          <div className="admin-total">
            <span>Total estimado</span>
            <strong>{formatPrice(Number(order.total))}</strong>
          </div>
        </section>
      </div>
      <AdminOrderForm order={order} />
      <section className="admin-panel">
        <h2>Historial</h2>
        <div className="status-history">
          {history?.map((entry) => (
            <article key={entry.id}>
              <span>
                {formatDate(entry.created_at, { dateStyle: "short", timeStyle: "short" })}
              </span>
              <strong>
                {orderStatusLabels[entry.previous_status] ?? "Creado"} →{" "}
                {orderStatusLabels[entry.new_status]}
              </strong>
              {entry.customer_visible_note && <p>{entry.customer_visible_note}</p>}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
