import Link from "next/link";
import { formatDate } from "@/lib/date";
import { formatPrice } from "@/lib/format";
import { orderStatusLabels } from "@/lib/orders";
import { requireAccount } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function OrdersPage() {
  const account = await requireAccount("/cuenta/pedidos");
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("storefront_orders")
    .select("id,order_number,status,total,currency,delivery_method,created_at")
    .eq("user_id", account.id)
    .order("created_at", { ascending: false });
  return (
    <>
      <div className="account-heading">
        <p className="eyebrow">Pedidos</p>
        <h1>Tu historial</h1>
        <p>Cada solicitud creada desde la tienda queda registrada acá.</p>
      </div>
      <div className="order-list">
        {!data?.length && (
          <div className="empty-state">
            <h2>Todavía no generaste pedidos</h2>
            <p>Cuando finalices un carrito por WhatsApp, aparecerá acá.</p>
            <Link className="button primary" href="/productos">
              Explorar productos
            </Link>
          </div>
        )}
        {data?.map((order) => (
          <Link key={order.id} href={`/cuenta/pedidos/${order.id}`}>
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
