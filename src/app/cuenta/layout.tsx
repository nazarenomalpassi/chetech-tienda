import Link from "next/link";
import {
  CircleUserRound,
  House,
  LockKeyhole,
  PackageSearch,
  UserRound,
  Wrench,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { requireAccount } from "@/lib/auth";

const links = [
  { href: "/cuenta", label: "Resumen", icon: CircleUserRound, customerOnly: false },
  { href: "/cuenta/perfil", label: "Perfil", icon: UserRound, customerOnly: false },
  { href: "/cuenta/direcciones", label: "Direcciones", icon: House, customerOnly: false },
  { href: "/cuenta/pedidos", label: "Pedidos", icon: PackageSearch, customerOnly: false },
  { href: "/cuenta/reparaciones", label: "Mis reparaciones", icon: Wrench, customerOnly: true },
  { href: "/cuenta/seguridad", label: "Seguridad", icon: LockKeyhole, customerOnly: false },
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const account = await requireAccount();
  return (
    <section className="account-area section">
      <div className="shell account-shell">
        <aside className="account-sidebar">
          <p className="eyebrow">Mi cuenta</p>
          <h2>{account.firstName || account.fullName || "Cliente"}</h2>
          <p>{account.email}</p>
          <nav>
            {links
              .filter((link) => !link.customerOnly || account.role === "customer")
              .map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}>
                  <Icon />
                  {label}
                </Link>
              ))}
            {account.role === "admin" && (
              <Link className="admin-link" href="/admin">
                Administración
              </Link>
            )}
          </nav>
          <LogoutButton className="text-button">Cerrar sesión</LogoutButton>
        </aside>
        <main className="account-content">{children}</main>
      </div>
    </section>
  );
}
