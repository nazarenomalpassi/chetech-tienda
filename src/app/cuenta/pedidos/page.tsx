import Link from "next/link";
import { requireAccount } from "@/lib/auth";
import { formatDate } from "@/lib/date";
import { formatPrice } from "@/lib/format";
import { orderStatusLabels } from "@/lib/orders";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AccountHeading } from "../account-heading";
import styles from "../account.module.css";

const ATTENTION = new Set(["awaiting_payment", "ready_for_pickup"]);

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
    .select("id,order_number,status,total,created_at,payment_method")
    .eq("user_id", account.id)
    .order("created_at", { ascending: false });
  return (
    <>
      <AccountHeading title="Pedidos">Tus compras en la tienda, con el estado al día.</AccountHeading>
      {data?.length ? (
        <ul className={styles.rows}>
          {data.map((order) => (
            <li key={order.id}>
              <Link
                href={order.payment_method ? `/pedido/${encodeURIComponent(order.order_number)}` : `/cuenta/pedidos/${order.id}`}
                className={styles.row}
              >
                <span className={styles.rowTitle}>{order.order_number}</span>
                <span className={styles.rowMeta}>{formatDate(order.created_at)}</span>
                <span className={styles.rowSide}>
                  <strong>{formatPrice(Number(order.total))}</strong>
                  <span className={styles.state} data-attention={ATTENTION.has(order.status)}>
                    {orderStatusLabels[order.status] ?? order.status}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.empty}>
          <p>Todavía no compraste con esta cuenta. Si compraste sin cuenta con este mail, el pedido aparece acá cuando lo confirmes.</p>
          <Link className="btn" href="/productos">
            Ver productos
          </Link>
        </div>
      )}
    </>
  );
}
