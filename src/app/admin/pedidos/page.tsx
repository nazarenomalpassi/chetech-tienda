import Link from "next/link";
import { formatDate } from "@/lib/date";
import { formatPrice } from "@/lib/format";
import { orderStatusLabels, orderStatuses } from "@/lib/orders";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  await requireAdmin();
  const { q = "", estado = "" } = await searchParams;
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("storefront_orders")
    .select(
      "id,order_number,status,customer_name_snapshot,customer_email_snapshot,total,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(150);
  if (q.trim())
    query = query.or(
      `order_number.ilike.%${q.trim().slice(0, 80)}%,customer_name_snapshot.ilike.%${q.trim().slice(0, 80)}%,customer_email_snapshot.ilike.%${q.trim().slice(0, 80)}%`,
    );
  if (orderStatuses.includes(estado)) query = query.eq("status", estado);
  const { data } = await query;
  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">Operación web</p>
        <h1>Pedidos</h1>
        <p>Solicitudes generadas desde el carrito y asociadas a clientes registrados.</p>
      </div>
      <form className="admin-search admin-order-filters">
        <label>
          Buscar
          <input name="q" defaultValue={q} placeholder="Número, cliente o correo" />
        </label>
        <label>
          Estado
          <select name="estado" defaultValue={estado}>
            <option value="">Todos</option>
            {orderStatuses.map((status) => (
              <option key={status} value={status}>
                {orderStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <button className="button primary">Filtrar</button>
      </form>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.map((order) => (
              <tr key={order.id}>
                <td>
                  <strong>{order.order_number}</strong>
                </td>
                <td>
                  <strong>{order.customer_name_snapshot}</strong>
                  <span>{order.customer_email_snapshot}</span>
                </td>
                <td>{formatDate(order.created_at, { dateStyle: "short", timeStyle: "short" })}</td>
                <td>
                  <span className={`status-pill status-${order.status}`}>
                    {orderStatusLabels[order.status]}
                  </span>
                </td>
                <td>{formatPrice(Number(order.total))}</td>
                <td>
                  <Link className="text-link" href={`/admin/pedidos/${order.id}`}>
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.length && (
          <div className="empty-state">
            <h2>No hay pedidos para ese filtro.</h2>
          </div>
        )}
      </div>
    </>
  );
}
