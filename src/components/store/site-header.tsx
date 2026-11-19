"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { families } from "@/config/catalog";
import { navigation } from "@/config/site";
import { useAccountSummary } from "@/components/account-provider";
import { useCart } from "@/components/cart-provider";
import { SearchOverlay } from "@/components/store/search-overlay";
import styles from "./site-header.module.css";

type Props = {
  announcement: string;
  showWorkshop: boolean;
};

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = `${pathname}${searchParams.toString() ? `?${searchParams}` : ""}`;
  const isActive = (href: string) =>
    href.includes("?") ? current === href : pathname === href || pathname.startsWith(`${href}/`);

  return navigation.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive(item.href) ? "page" : undefined}
      className={styles.navLink}
    >
      {item.label}
    </Link>
  ));
}

export function SiteHeader({ announcement, showWorkshop }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const { account } = useAccountSummary();
  const { count, openDrawer } = useCart();

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const accountHref = account ? "/cuenta" : "/ingresar";
  const accountLabel = account ? `Mi cuenta, ${account.firstName}` : "Ingresar";

  return (
    <>
      <header className={styles.header}>
        <div className={styles.strip}>
          <div className={`page ${styles.stripInner}`}>
            <p>{announcement}</p>
            <a href={`https://wa.me/5493571544683`} target="_blank" rel="noreferrer" className={styles.stripLink}>
              WhatsApp (3571) 544683
            </a>
          </div>
        </div>
        <div className={styles.bar}>
          <div className={`page ${styles.barInner}`}>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.menuButton}`}
              aria-label="Abrir menú"
              aria-expanded={menuOpen}
              aria-controls="menu-principal"
              onClick={() => setMenuOpen(true)}
            >
              <Menu aria-hidden size={22} />
            </button>
            <Link href="/" className={styles.brand} aria-label="CheTech, inicio">
              <Image src="/brand/chetech-logo-tinta.svg" alt="" width={160} height={28} priority />
            </Link>
            <nav className={styles.nav} aria-label="Principal">
              <Suspense fallback={null}>
                <NavLinks />
              </Suspense>
            </nav>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.searchButton}
                onClick={() => setSearchOpen(true)}
                aria-label="Buscar un producto o modelo"
              >
                <Search aria-hidden size={20} />
                <span className={styles.searchPlaceholder}>Buscá un producto o modelo</span>
                <kbd className={styles.kbd} aria-hidden>
                  /
                </kbd>
              </button>
              <Link href={accountHref} className={styles.iconButton} aria-label={accountLabel}>
                <UserRound aria-hidden size={22} />
                {account && account.recentUpdates > 0 ? <span className={styles.dot} aria-hidden /> : null}
              </Link>
              <button
                type="button"
                className={styles.iconButton}
                onClick={openDrawer}
                aria-label={count ? `Carrito, ${count} ${count === 1 ? "producto" : "productos"}` : "Carrito vacío"}
                data-cart-target
              >
                <ShoppingBag aria-hidden size={22} />
                {count > 0 ? (
                  <span key={count} className={styles.count} aria-hidden>
                    {count}
                  </span>
                ) : null}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div
        id="menu-principal"
        className={styles.menu}
        data-open={menuOpen}
        aria-hidden={!menuOpen}
        inert={!menuOpen}
      >
        <button type="button" className={styles.menuScrim} aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} tabIndex={-1} />
        <div className={styles.menuPanel} role="dialog" aria-modal="true" aria-label="Menú">
          <div className={styles.menuHead}>
            <Image src="/brand/chetech-logo-tinta.svg" alt="CheTech" width={137} height={24} />
            <button type="button" className={styles.iconButton} aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}>
              <X aria-hidden size={22} />
            </button>
          </div>
          <div className="carta" aria-hidden />
          <nav className={styles.menuNav} aria-label="Menú principal">
            <Suspense fallback={null}>
              <NavLinks onNavigate={() => setMenuOpen(false)} />
            </Suspense>
          </nav>
          <p className={styles.menuTitle}>Familias</p>
          <ul className={styles.menuFamilies}>
            {families
              .filter((family) => family.slug !== "del-taller" || showWorkshop)
              .map((family) => (
                <li key={family.slug}>
                  <Link href={`/productos?familia=${family.slug}`} onClick={() => setMenuOpen(false)} data-signal={family.signal}>
                    {family.name}
                  </Link>
                </li>
              ))}
          </ul>
          <div className={styles.menuFoot}>
            <Link href={accountHref} className="btn" data-variant="quiet" data-block="true" onClick={() => setMenuOpen(false)}>
              {account ? "Mi cuenta" : "Ingresar o crear cuenta"}
            </Link>
          </div>
        </div>
      </div>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
