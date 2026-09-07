import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";

export default async function DashboardPage() {
  await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const [pending, customers, published, unavailable, recent, confirmed] = await Promise.all([
    supabase
      .from("storefront_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending_whatsapp", "pending_confirmation"]),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
    supabase
      .from("storefront_products")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true)
      .is("archived_at", null),
    supabase
      .from("storefront_products")
      .select("id", { count: "exact", head: true })
      .eq("availability_label", "Sin stock"),
    supabase
      .from("storefront_orders")
      .select("id,order_number,status,total,customer_name_snapshot,created_at")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("storefront_orders")
      .select("total")
      .in("status", [
        "confirmed",
        "awaiting_payment",
        "paid",
        "preparing",
        "shipped",
        "ready_for_pickup",
        "completed",
      ]),
  ]);
  const confirmedTotal = (confirmed.data ?? []).reduce((sum, row) => sum + Number(row.total), 0);
  const cards = [
    ["Pedidos pendientes", pending.count ?? 0],
    ["Clientes registrados", customers.count ?? 0],
    ["Productos publicados", published.count ?? 0],
    ["Sin stock", unavailable.count ?? 0],
  ];
  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">E-commerce</p>
        <h1>Dashboard</h1>
        <p>
          Datos reales de la tienda pública. No se mezclan ventas ni reparaciones del sistema
          interno.
        </p>
      </div>
      <div className="admin-metric-grid">
        {cards.map(([label, value]) => (
          <article key={String(label)}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
        <article>
          <span>Total de pedidos confirmados</span>
          <strong>{formatPrice(confirmedTotal)}</strong>
        </article>
      </div>
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <h2>Pedidos recientes</h2>
          <Link href="/admin/pedidos">Ver todos</Link>
        </div>
        <div className="admin-list">
          {recent.data?.map((order) => (
            <Link key={order.id} href={`/admin/pedidos/${order.id}`}>
              <strong>{order.order_number}</strong>
              <span>{order.customer_name_snapshot}</span>
              <span>{formatPrice(Number(order.total))}</span>
            </Link>
          ))}
          {!recent.data?.length && <p>Todavía no hay pedidos web.</p>}
        </div>
      </section>
    </>
  );
}
