import Link from "next/link";
import {
  Boxes,
  CircleGauge,
  ClipboardList,
  Cog,
  Cpu,
  FolderTree,
  PackageCheck,
  QrCode,
  TicketPercent,
  UsersRound,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth";
// Estilos anteriores al rediseño que siguen usando las pantallas de Administración.
import "@/styles/legacy/admin.css";

const links = [
  ["/admin/dashboard", "Tablero", CircleGauge],
  ["/admin/productos", "Productos", Boxes],
  ["/admin/placas", "Placas", Cpu],
  ["/admin/reacondicionados", "Reacondicionados", PackageCheck],
  ["/admin/categorias", "Categorías", FolderTree],
  ["/admin/pedidos", "Pedidos", ClipboardList],
  ["/admin/clientes", "Clientes", UsersRound],
  ["/admin/enlaces", "Enlaces y QR", QrCode],
  ["/admin/cupones", "Cupones", TicketPercent],
  ["/admin/configuracion", "Configuración", Cog],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
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
