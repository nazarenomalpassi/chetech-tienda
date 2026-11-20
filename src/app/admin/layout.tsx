import Link from "next/link";
import {
  BellRing,
  Boxes,
  CircleGauge,
  ClipboardList,
  Cog,
  Cpu,
  FolderTree,
  Inbox,
  PackageCheck,
  QrCode,
  TicketPercent,
  UsersRound,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import styles from "./admin-nav.module.css";
// Estilos anteriores al rediseño que siguen usando las pantallas de Administración.
import "@/styles/legacy/admin.css";

const links = [
  ["/admin/dashboard", "Tablero", CircleGauge],
  ["/admin/productos", "Productos", Boxes],
  ["/admin/placas", "Placas", Cpu],
  ["/admin/reacondicionados", "Reacondicionados", PackageCheck],
  ["/admin/categorias", "Categorías", FolderTree],
  ["/admin/pedidos", "Pedidos", ClipboardList],
  ["/admin/lista-de-espera", "Lista de espera", BellRing],
  ["/admin/solicitudes", "Solicitudes", Inbox],
  ["/admin/clientes", "Clientes", UsersRound],
  ["/admin/enlaces", "Enlaces y QR", QrCode],
  ["/admin/cupones", "Cupones", TicketPercent],
  ["/admin/configuracion", "Configuración", Cog],
] as const;

/** Cuántas personas esperan un aviso y cuántas solicitudes faltan responder: se ven en el menú. */
async function pendingCounts(): Promise<Record<string, number>> {
  const supabase = await createServerSupabaseClient();
  const [waitlist, requests] = await Promise.all([
    supabase
      .from("storefront_waitlist")
      .select("id", { count: "exact", head: true })
      .is("notified_at", null),
    supabase.rpc("get_consumer_requests_admin", { p_limit: 300 }),
  ]);
  const open = Array.isArray(requests.data)
    ? requests.data.filter(
        (item: { status?: string }) => item.status === "received" || item.status === "in_review",
      ).length
    : 0;
  return { "/admin/lista-de-espera": waitlist.count ?? 0, "/admin/solicitudes": open };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const counts = await pendingCounts();
  return (
    <section className="admin-area">
      <aside className="admin-sidebar">
        <div>
          <p className="eyebrow">Chetech</p>
          <h2>Administración de la tienda</h2>
          <span>{admin.email}</span>
        </div>
        <nav>
          {links.map(([href, label, Icon]) => (
            <Link key={href} href={href}>
              <Icon />
              {label}
              {counts[href] ? (
                <span className={styles.badge}>
                  {counts[href]}
                  <span className="visually-hidden"> sin atender</span>
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
        <Link className="admin-back" href="/cuenta">
          Volver a mi cuenta
        </Link>
      </aside>
      <div className="admin-content">{children}</div>
    </section>
  );
}
