"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound, House, LockKeyhole, PackageSearch, Settings, UserRound, Wrench } from "lucide-react";
import styles from "./account.module.css";

const links = [
  { href: "/cuenta", label: "Resumen", icon: CircleUserRound, customerOnly: false },
  { href: "/cuenta/pedidos", label: "Pedidos", icon: PackageSearch, customerOnly: false },
  { href: "/cuenta/reparaciones", label: "Reparaciones", icon: Wrench, customerOnly: true },
  { href: "/cuenta/direcciones", label: "Direcciones", icon: House, customerOnly: false },
  { href: "/cuenta/perfil", label: "Mis datos", icon: UserRound, customerOnly: false },
  { href: "/cuenta/seguridad", label: "Contraseña", icon: LockKeyhole, customerOnly: false },
];

export function AccountNav({ role }: { role: string }) {
  const pathname = usePathname();
  const isCurrent = (href: string) => (href === "/cuenta" ? pathname === href : pathname.startsWith(href));
  return (
    <nav className={styles.nav} aria-label="Mi cuenta">
      {links
        .filter((link) => !link.customerOnly || role === "customer")
        .map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={isCurrent(href) ? "page" : undefined}>
            <Icon aria-hidden />
            {label}
          </Link>
        ))}
      {role === "admin" ? (
        <Link href="/admin">
          <Settings aria-hidden />
          Administración
        </Link>
      ) : null}
    </nav>
  );
}
