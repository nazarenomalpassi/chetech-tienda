import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { formatPrice, formatShortDateTime } from "@/lib/format";
import {
  adminOrderViews,
  deliveryMethodLabels,
  orderStatusLabels,
  orderTone,
  paymentMethodLabels,
  paymentStatusLabels,
  type AdminOrderView,
} from "@/lib/orders";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import styles from "./orders.module.css";

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  payment_method: string | null;
  payment_status: string;
  delivery_method: string;
  customer_name_snapshot: string;
  customer_email_snapshot: string;
  total: number | string;
  created_at: string;
  reserved_until: string | null;
  transfer_reported_at: string | null;
  needs_attention: string | null;
};

const COLUMNS =
  "id,order_number,status,payment_method,payment_status,delivery_method,customer_name_snapshot,customer_email_snapshot,total,created_at,reserved_until,transfer_reported_at,needs_attention";

// Lo que hay que mirar hoy: avisos, cobrados sin preparar, transferencias avisadas, pagos al retirar
// y los pedidos viejos por WhatsApp.
const ATTENTION_FILTER = [
  "needs_attention.not.is.null",
  "status.in.(paid,preparing,pending_whatsapp,pending_confirmation,confirmed)",
  "and(status.eq.awaiting_payment,transfer_reported_at.not.is.null)",
  "and(status.eq.awaiting_payment,payment_method.eq.pickup)",
].join(",");

function viewFilter(view: AdminOrderView): { or?: string; statuses?: string[] } {
  switch (view) {
    case "atender":
      return { or: ATTENTION_FILTER };
    case "pago":
      return { statuses: ["awaiting_payment"] };
    case "listos":
      return { statuses: ["ready_for_pickup", "shipped"] };
    case "cerrados":
      return { statuses: ["completed", "cancelled", "expired", "returned"] };
    default:
      return {};
  }
}

function cleanSearch(value: string) {
  return value.replace(/[^\p{L}\p{N}@.\-_ ]/gu, "").trim().slice(0, 80);
}

function paymentLine(order: OrderRow) {
  if (!order.payment_method) return "Coordinado por WhatsApp";
  const method = paymentMethodLabels[order.payment_method] ?? order.payment_method;
  if (order.status === "awaiting_payment" && order.transfer_reported_at)
    return `${method} · el cliente avisó que transfirió`;
  return `${method} · ${paymentStatusLabels[order.payment_status] ?? order.payment_status}`;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; buscar?: string; vista?: string }>;
}) {
  await requireAdmin("/admin/pedidos");
  const params = await searchParams;
  const search = cleanSearch(params.buscar ?? params.q ?? "");
  const view: AdminOrderView = adminOrderViews.some((item) => item.key === params.vista)
    ? (params.vista as AdminOrderView)
    : search
      ? "todos"
      : "atender";
  const supabase = await createServerSupabaseClient();

  // El QR del comprobante trae ?buscar=CHT-000123: si coincide justo, va directo al pedido.
  if (params.buscar && /^CHT-\d{6}$/i.test(search)) {
    const { data } = await supabase
      .from("storefront_orders")
      .select("id")
      .eq("order_number", search.toUpperCase())
      .maybeSingle();
    if (data) redirect(`/admin/pedidos/${data.id}`);
  }

  let listQuery = supabase
    .from("storefront_orders")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(150);
  const filter = viewFilter(view);
  if (filter.or) listQuery = listQuery.or(filter.or);
  if (filter.statuses) listQuery = listQuery.in("status", filter.statuses);
  if (search)
    listQuery = listQuery.or(
      `order_number.ilike.%${search}%,customer_name_snapshot.ilike.%${search}%,customer_email_snapshot.ilike.%${search}%,customer_phone_snapshot.ilike.%${search}%`,
    );

  const countQueries = adminOrderViews.map((item) => {
    const itemFilter = viewFilter(item.key);
    let countQuery = supabase.from("storefront_orders").select("id", { count: "exact", head: true });
    if (itemFilter.or) countQuery = countQuery.or(itemFilter.or);
    if (itemFilter.statuses) countQuery = countQuery.in("status", itemFilter.statuses);
    return countQuery;
  });
  const [{ data, error }, ...counts] = await Promise.all([listQuery, ...countQueries]);
  const orders = (data ?? []) as OrderRow[];

  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">Tienda</p>
        <h1>Pedidos</h1>
        <p>Compras hechas en la tienda. Cada cambio queda registrado y le avisa al cliente por mail.</p>
      </div>

      <ul className={styles.views} aria-label="Vistas">
        {adminOrderViews.map((item, index) => (
          <li key={item.key}>
            <Link
              href={item.key === "atender" ? "/admin/pedidos" : `/admin/pedidos?vista=${item.key}`}
              aria-current={view === item.key && !search ? "page" : undefined}
            >
              {item.label}
              <span className={styles.count}>{counts[index]?.count ?? 0}</span>
            </Link>
          </li>
        ))}
      </ul>

      <form className={styles.toolbar} role="search">
        <input type="hidden" name="vista" value={view} />
        <label>
          Buscar pedido
          <input name="q" defaultValue={search} placeholder="Número, nombre, mail o teléfono" />
        </label>
        <button className="btn" data-variant="secondary">
          Buscar
        </button>
        {search ? (
          <Link className="enlace" href={`/admin/pedidos?vista=${view}`}>
            Limpiar búsqueda
          </Link>
        ) : null}
      </form>

      {error ? (
        <p className={styles.message} data-kind="error" role="alert">
          No pudimos cargar los pedidos. Recargá la página.
        </p>
      ) : null}

      <div className={styles.list}>
        {orders.map((order) => (
          <Link key={order.id} href={`/admin/pedidos/${order.id}`} className={styles.row}>
            <div>
              <strong>{order.order_number}</strong>
              <small>{formatShortDateTime(order.created_at)}</small>
            </div>
            <div>
              <strong>{order.customer_name_snapshot}</strong>
              <small>
                {deliveryMethodLabels[order.delivery_method] ?? order.delivery_method} · {paymentLine(order)}
              </small>
            </div>
            <div>
              <span className={styles.status} data-tone={orderTone(order.status, order.needs_attention)}>
                {orderStatusLabels[order.status] ?? order.status}
              </span>
              {order.needs_attention ? <span className={styles.attention}>{order.needs_attention}</span> : null}
              {order.status === "awaiting_payment" && order.reserved_until ? (
                <small>Reserva hasta {formatShortDateTime(order.reserved_until)}</small>
              ) : null}
            </div>
            <div className={styles.total}>{formatPrice(Number(order.total))}</div>
          </Link>
        ))}
        {!orders.length && !error ? (
          <p className={styles.empty}>
            {search
              ? "No hay pedidos con esa búsqueda."
              : view === "atender"
                ? "No hay nada para atender. Los pedidos nuevos aparecen acá."
                : "No hay pedidos en esta vista."}
          </p>
        ) : null}
      </div>
    </>
  );
}
