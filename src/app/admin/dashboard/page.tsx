import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatNumber, formatPrice } from "@/lib/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import styles from "./dashboard.module.css";

type Totals = { visits: number; orders: number; paid_orders: number; revenue: number; attention: number };
type OriginRow = { source: string; campaign: string; content: string; orders: number; paid_orders: number; revenue: number };
type VisitRow = { source: string; medium: string; campaign: string; content: string; sessions: number };

const PERIODS = [7, 30, 90] as const;

const sourceNames: Record<string, string> = {
  directo: "Directo",
  instagram: "Instagram",
  facebook: "Facebook",
  google: "Google",
  whatsapp: "WhatsApp",
  qr: "QR del local",
  taller: "Clientes del taller",
  mostrador: "Mostrador",
};

const sourceName = (source: string) => sourceNames[source] ?? source;
const dash = (value: string) => (value && value !== "-" ? value : "");

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  await requireAdmin("/admin/dashboard");
  const { dias } = await searchParams;
  const days = PERIODS.find((value) => String(value) === dias) ?? 30;
  const supabase = await createServerSupabaseClient();

  const [dashboard, attention, catalog] = await Promise.all([
    supabase.rpc("storefront_admin_dashboard", { p_days: days }),
    supabase
      .from("storefront_orders")
      .select("id", { count: "exact", head: true })
      .or(
        "needs_attention.not.is.null,status.in.(paid,preparing),and(status.eq.awaiting_payment,transfer_reported_at.not.is.null)",
      ),
    supabase
      .from("storefront_products")
      .select("id,primary_image_url,family_override,category_slug,shipping_size,brand,warranty_months")
      .eq("is_published", true)
      .is("archived_at", null),
  ]);

  const data = (dashboard.data ?? {}) as { totals?: Totals; orders?: OriginRow[]; visits?: VisitRow[] };
  const totals: Totals = { visits: 0, orders: 0, paid_orders: 0, revenue: 0, attention: 0, ...(data.totals ?? {}) };
  const products = catalog.data ?? [];
  const health = [
    { label: "Sin foto", count: products.filter((item) => !item.primary_image_url).length, href: "/admin/productos?falta=foto" },
    {
      label: "Sin familia",
      count: products.filter((item) => !item.family_override && ["varios", "reparacion", "vapers", null].includes(item.category_slug)).length,
      href: "/admin/productos?falta=familia",
    },
    { label: "Sin tamaño de envío", count: products.filter((item) => !item.shipping_size).length, href: "/admin/productos?falta=envio" },
    { label: "Sin marca", count: products.filter((item) => !item.brand?.trim()).length, href: "/admin/productos?falta=marca" },
  ];
  const conversion = totals.visits > 0 ? (Number(totals.paid_orders) / Number(totals.visits)) * 100 : 0;

  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">Tienda</p>
        <h1>Tablero</h1>
        <p>Visitas, pedidos y ventas de la tienda online. No incluye ventas de mostrador ni reparaciones.</p>
      </div>

      <nav className={styles.periods} aria-label="Período">
        {PERIODS.map((value) => (
          <Link key={value} href={`/admin/dashboard?dias=${value}`} aria-current={value === days ? "page" : undefined}>
            Últimos {value} días
          </Link>
        ))}
      </nav>

      {dashboard.error ? (
        <p className={styles.error} role="alert">
          No pudimos cargar el tablero. Recargá la página.
        </p>
      ) : null}

      <dl className={styles.metrics}>
        <div>
          <dt>Visitas</dt>
          <dd>{formatNumber(Number(totals.visits))}</dd>
        </div>
        <div>
          <dt>Pedidos</dt>
          <dd>{formatNumber(Number(totals.orders))}</dd>
        </div>
        <div>
          <dt>Pedidos cobrados</dt>
          <dd>{formatNumber(Number(totals.paid_orders))}</dd>
        </div>
        <div>
          <dt>Ventas cobradas</dt>
          <dd>{formatPrice(Number(totals.revenue))}</dd>
        </div>
        <div>
          <dt>Visitas que compran</dt>
          <dd>{conversion.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %</dd>
        </div>
        <div data-alert={Boolean(attention.count)}>
          <dt>Para atender ahora</dt>
          <dd>
            <Link href="/admin/pedidos">{attention.count ?? 0}</Link>
          </dd>
        </div>
      </dl>

      <section className={styles.panel}>
        <h2>Ventas por origen</h2>
        <p>De dónde llegó cada persona que compró: el reel, la historia, Google o el QR del local.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Origen</th>
                <th scope="col">Campaña</th>
                <th scope="col">Pieza</th>
                <th scope="col" className={styles.num}>Pedidos</th>
                <th scope="col" className={styles.num}>Cobrados</th>
                <th scope="col" className={styles.num}>Ventas</th>
              </tr>
            </thead>
            <tbody>
              {(data.orders ?? []).map((row) => (
                <tr key={`${row.source}-${row.campaign}-${row.content}`}>
                  <td>{sourceName(row.source)}</td>
                  <td>{dash(row.campaign)}</td>
                  <td>{dash(row.content)}</td>
                  <td className={styles.num}>{row.orders}</td>
                  <td className={styles.num}>{row.paid_orders}</td>
                  <td className={styles.num}>{formatPrice(Number(row.revenue))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!(data.orders ?? []).length ? <p className={styles.empty}>Todavía no hay pedidos en este período.</p> : null}
        </div>
      </section>

      <section className={styles.panel}>
        <h2>Visitas por origen</h2>
        <p>Una visita por cada vez que alguien abre la tienda. Se cuenta sin datos personales.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Origen</th>
                <th scope="col">Medio</th>
                <th scope="col">Campaña</th>
                <th scope="col">Pieza</th>
                <th scope="col" className={styles.num}>Visitas</th>
              </tr>
            </thead>
            <tbody>
              {(data.visits ?? []).map((row) => (
                <tr key={`${row.source}-${row.medium}-${row.campaign}-${row.content}`}>
                  <td>{sourceName(row.source)}</td>
                  <td>{dash(row.medium)}</td>
                  <td>{dash(row.campaign)}</td>
                  <td>{dash(row.content)}</td>
                  <td className={styles.num}>{formatNumber(row.sessions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!(data.visits ?? []).length ? <p className={styles.empty}>Todavía no hay visitas registradas en este período.</p> : null}
        </div>
      </section>

      <section className={styles.panel}>
        <h2>Catálogo publicado</h2>
        <p>{products.length} productos publicados. Lo que les falta para venderse solos:</p>
        <ul className={styles.health}>
          {health.map((item) => (
            <li key={item.label} data-ok={item.count === 0}>
              <Link href={item.href}>
                <strong>{item.count}</strong> {item.label.toLowerCase()}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
