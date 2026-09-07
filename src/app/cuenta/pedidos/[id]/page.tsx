import { notFound } from "next/navigation";
import { formatDate } from "@/lib/date";
import { formatPrice } from "@/lib/format";
import { deliveryMethodLabels, orderStatusLabels } from "@/lib/orders";
import { requireAccount } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
  const items = (
    Array.isArray(order.storefront_order_items) ? order.storefront_order_items : []
  ) as OrderItemRow[];
  return (
    <>
      <div className="account-heading">
        <p className="eyebrow">{order.order_number}</p>
        <h1>Detalle del pedido</h1>
        <p>{formatDate(order.created_at, { dateStyle: "long", timeStyle: "short" })}</p>
      </div>
      <div className="order-detail-summary">
        <div>
          <span>Estado</span>
          <strong>{orderStatusLabels[order.status] ?? order.status}</strong>
        </div>
        <div>
          <span>Entrega</span>
          <strong>{deliveryMethodLabels[order.delivery_method] ?? order.delivery_method}</strong>
        </div>
        <div>
          <span>Total estimado</span>
          <strong>{formatPrice(Number(order.total))}</strong>
        </div>
      </div>
      <div className="order-items">
        {items.map((item) => (
          <article key={item.id}>
            <div>
              <h2>{item.product_name_snapshot}</h2>
            </div>
            <span>
              {item.quantity} × {formatPrice(Number(item.unit_price_snapshot))}
            </span>
            <strong>{formatPrice(Number(item.subtotal))}</strong>
          </article>
        ))}
      </div>
      {!!history?.length && (
        <section className="account-order-updates" aria-labelledby="order-updates-title">
          <div className="account-order-updates-heading">
            <p className="eyebrow">Seguimiento</p>
            <h2 id="order-updates-title">Novedades del pedido</h2>
          </div>
          <div className="account-order-updates-list">
            {history.map((entry) => (
              <article className="account-note" key={entry.id}>
                <div>
                  <strong>{orderStatusLabels[entry.new_status] ?? "Actualización"}</strong>
                  <time dateTime={entry.created_at}>
                    {formatDate(entry.created_at, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </div>
                <p>{entry.customer_visible_note}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      {order.customer_notes && (
        <div className="account-note">
          <strong>Tu observación</strong>
          <p>{order.customer_notes}</p>
        </div>
      )}
    </>
  );
}
