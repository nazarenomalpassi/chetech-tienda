import Link from "next/link";
import { formatDate } from "@/lib/date";
import { formatPrice } from "@/lib/format";
import { orderStatusLabels } from "@/lib/orders";
import { requireAccount } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function OrdersPage() {
  const account = await requireAccount("/cuenta/pedidos");
  const supabase = await createServerSupabaseClient();
  // Si compró sin cuenta con este mail (ya verificado), esos pedidos aparecen acá.
  await supabase.rpc("storefront_claim_guest_orders").then(
    () => undefined,
    () => undefined,
  );
  const { data } = await supabase
    .from("storefront_orders")
    .select("id,order_number,status,total,currency,delivery_method,payment_method,created_at")
    .eq("user_id", account.id)
    .order("created_at", { ascending: false });
  return (
    <>
      <div className="account-heading">
        <p className="eyebrow">Pedidos</p>
        <h1>Tu historial</h1>
        <p>Tus compras en la tienda, con su estado al día.</p>
      </div>
      <div className="order-list">
        {!data?.length && (
          <div className="empty-state">
            <h2>Todavía no generaste pedidos</h2>
            <p>Cuando compres en la tienda con esta cuenta, el pedido aparece acá.</p>
            <Link className="button primary" href="/productos">
              Explorar productos
            </Link>
          </div>
        )}
        {data?.map((order) => (
          <Link
            key={order.id}
            href={
              order.payment_method
                ? `/pedido/${encodeURIComponent(order.order_number)}`
                : `/cuenta/pedidos/${order.id}`
            }
          >
            <div>
              <span>{formatDate(order.created_at)}</span>
              <strong>{order.order_number}</strong>
            </div>
            <span className={`status-pill status-${order.status}`}>
              {orderStatusLabels[order.status] ?? order.status}
            </span>
            <strong>{formatPrice(Number(order.total))}</strong>
          </Link>
        ))}
      </div>
    </>
  );
}
