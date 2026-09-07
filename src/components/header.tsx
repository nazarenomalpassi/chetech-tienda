"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { navigation } from "@/config/site";
import { useAccountSummary } from "@/components/account-provider";
import { useCart } from "@/components/cart-provider";
import { LogoutButton } from "@/components/logout-button";

function repairsMenuLabel(recentUpdates = 0) {
  if (recentUpdates <= 0) return "Mis reparaciones";
  return `Mis reparaciones · ${recentUpdates} ${recentUpdates === 1 ? "novedad" : "novedades"}`;
}

export function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { account, loading: accountLoading } = useAccountSummary();
  const { count } = useCart();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const desktopQuery = window.matchMedia("(min-width: 1051px)");
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeOnDesktop = () => {
      if (desktopQuery.matches) setOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    desktopQuery.addEventListener("change", closeOnDesktop);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      desktopQuery.removeEventListener("change", closeOnDesktop);
    };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="site-header">
      <div className="announcement">
        Río Tercero <span>·</span> Compras y consultas por WhatsApp
      </div>
      <div className="header-inner shell">
        <Link className="brand" href="/" aria-label="Chetech, inicio">
          <Image
            src="/brand/chetech-horizontal-white.svg"
            width={220}
            height={54}
            priority
            alt="Chetech"
          />
        </Link>
        <nav className="desktop-nav" aria-label="Navegación principal">
          {navigation.map((item) => (
            <Link
              className={isActive(item.href) ? "active" : undefined}
              aria-current={isActive(item.href) ? "page" : undefined}
              key={item.href}
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <Link href="/productos" className="icon-button" aria-label="Buscar productos">
            <Search />
          </Link>
          {accountLoading ? (
            <span className="icon-button account-loading" aria-hidden="true">
              <UserRound />
            </span>
          ) : account ? (
            <details className="account-menu">
              <summary className="icon-button" aria-label="Abrir menú de cuenta">
                <UserRound />
                <span>{account.firstName?.slice(0, 1).toUpperCase() || "C"}</span>
              </summary>
              <div>
                <Link href="/cuenta">Mi cuenta</Link>
                <Link href="/cuenta/pedidos">Mis pedidos</Link>
                {account.role === "customer" && (
                  <Link
                    className={account.recentUpdates > 0 ? "has-updates" : undefined}
                    href="/cuenta/reparaciones"
                  >
                    {repairsMenuLabel(account.recentUpdates)}
                  </Link>
                )}
                <Link href="/cuenta/perfil">Mis datos</Link>
                {account.role === "admin" && <Link href="/admin">Administración</Link>}
                <LogoutButton>
                  <LogOut />
                  Cerrar sesión
                </LogoutButton>
              </div>
            </details>
          ) : (
            <Link
              href="/ingresar"
              className="icon-button account-login"
              aria-label="Ingresar a mi cuenta"
            >
              <UserRound />
            </Link>
          )}
          <Link
            href="/carrito"
            className="cart-button"
            aria-label={`Carrito con ${count} productos`}
          >
            <ShoppingBag />
            <span>{count}</span>
          </Link>
          <button
            className="menu-button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-menu" className="mobile-menu" aria-label="Navegación móvil">
          {navigation.map((item) => (
            <Link
              className={isActive(item.href) ? "active" : undefined}
              aria-current={isActive(item.href) ? "page" : undefined}
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          {!accountLoading &&
            (account ? (
              <>
                <Link href="/cuenta" onClick={() => setOpen(false)}>
                  Mi cuenta
                </Link>
                <Link href="/cuenta/pedidos" onClick={() => setOpen(false)}>
                  Mis pedidos
                </Link>
                {account.role === "customer" && (
                  <Link
                    className={account.recentUpdates > 0 ? "has-updates" : undefined}
                    href="/cuenta/reparaciones"
                    onClick={() => setOpen(false)}
                  >
                    {repairsMenuLabel(account.recentUpdates)}
                  </Link>
                )}
                <Link href="/cuenta/perfil" onClick={() => setOpen(false)}>
                  Mis datos
                </Link>
                {account.role === "admin" && (
                  <Link href="/admin" onClick={() => setOpen(false)}>
                    Administración
                  </Link>
                )}
                <LogoutButton>Cerrar sesión</LogoutButton>
              </>
            ) : (
              <>
                <Link href="/ingresar" onClick={() => setOpen(false)}>
                  Ingresar
                </Link>
                <Link href="/registrarse" onClick={() => setOpen(false)}>
                  Crear cuenta
                </Link>
              </>
            ))}
        </nav>
      )}
    </header>
  );
}
