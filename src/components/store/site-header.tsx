"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { families } from "@/config/catalog";
import { navigation } from "@/config/site";
import { useAccountSummary } from "@/components/account-provider";
import { useCart } from "@/components/cart-provider";
import { FamilyPanel, type PanelFamily } from "@/components/store/family-panel";
import { SearchOverlay } from "@/components/store/search-overlay";
import { markHydrated } from "@/lib/hydration";
import styles from "./site-header.module.css";

type Props = {
  announcement: string;
  showWorkshop: boolean;
  /** Familias con cantidad y fotos, para el panel que se abre desde "Productos" en escritorio. */
  panelFamilies: PanelFamily[];
};

type PanelTrigger = {
  open: boolean;
  props: Pick<
    React.ComponentProps<typeof Link>,
    "onPointerEnter" | "onPointerLeave" | "onKeyDown" | "aria-expanded" | "aria-controls"
  >;
};

function NavLinks({ onNavigate, panel }: { onNavigate?: () => void; panel?: PanelTrigger }) {
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
      data-panel-open={panel && item.href === "/productos" ? panel.open : undefined}
      {...(panel && item.href === "/productos" ? panel.props : {})}
    >
      {item.label}
    </Link>
  ));
}

export function SiteHeader({ announcement, showWorkshop, panelFamilies }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { account } = useAccountSummary();
  const { count, openDrawer } = useCart();

  // Al cambiar de página se cierran el menú y el buscador (ajuste de estado durante el render).
  const [shownPath, setShownPath] = useState(pathname);
  if (shownPath !== pathname) {
    setShownPath(pathname);
    setMenuOpen(false);
    setSearchOpen(false);
    setPanelOpen(false);
  }

  // Panel de familias (escritorio): se abre al apoyar el cursor o al llegar con el teclado, y espera
  // un instante antes de cerrarse para que el cursor pueda cruzar del menú al panel.
  const schedulePanel = (open: boolean, delay: number) => {
    if (panelTimer.current) clearTimeout(panelTimer.current);
    panelTimer.current = setTimeout(() => setPanelOpen(open), delay);
  };
  useEffect(() => () => void (panelTimer.current && clearTimeout(panelTimer.current)), []);

  // Un par de segundos después de la primera carga, las navegaciones internas ya pueden animar números.
  useEffect(() => {
    const timer = setTimeout(markHydrated, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Con mouse el panel se abre al apoyar el cursor. Con teclado, "Productos" sigue siendo un enlace
  // común y la flecha hacia abajo abre el panel y lleva el foco a la primera familia.
  const panelTrigger: PanelTrigger = {
    open: panelOpen,
    props: {
      "aria-expanded": panelOpen,
      "aria-controls": "panel-familias",
      onPointerEnter: (event) => event.pointerType === "mouse" && schedulePanel(true, 70),
      onPointerLeave: (event) => event.pointerType === "mouse" && schedulePanel(false, 180),
      onKeyDown: (event) => {
        if (event.key === "Escape") schedulePanel(false, 0);
        if (event.key !== "ArrowDown") return;
        event.preventDefault();
        schedulePanel(true, 0);
        setTimeout(() => panelRef.current?.querySelector<HTMLElement>("a")?.focus(), 60);
      },
    },
  };

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
        <div className={`oscuro ${styles.bar}`}>
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
              <Image src="/brand/chetech-logo-blanco.svg" alt="" width={160} height={28} priority />
            </Link>
            <nav className={styles.nav} aria-label="Principal">
              <Suspense fallback={null}>
                <NavLinks panel={panelFamilies.length ? panelTrigger : undefined} />
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
          {panelFamilies.length ? (
            <FamilyPanel
              ref={panelRef}
              families={panelFamilies}
              open={panelOpen}
              onEnter={() => schedulePanel(true, 0)}
              onLeave={() => schedulePanel(false, 180)}
              onClose={() => schedulePanel(false, 0)}
            />
          ) : null}
        </div>
      </header>
      <div className={styles.panelScrim} data-open={panelOpen} aria-hidden />

      <div
        id="menu-principal"
        className={styles.menu}
        data-open={menuOpen}
        aria-hidden={!menuOpen}
        inert={!menuOpen}
      >
        <button type="button" className={styles.menuScrim} aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} tabIndex={-1} />
        <div className={`oscuro ${styles.menuPanel}`} role="dialog" aria-modal="true" aria-label="Menú">
          <div className={styles.menuHead}>
            <Image src="/brand/chetech-logo-blanco.svg" alt="CheTech" width={137} height={24} />
            <button type="button" className={styles.iconButton} aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}>
              <X aria-hidden size={22} />
            </button>
          </div>
          <nav className={styles.menuNav} aria-label="Menú principal">
            <Suspense fallback={null}>
              <NavLinks onNavigate={() => setMenuOpen(false)} />
            </Suspense>
          </nav>
          <p className={styles.menuTitle}>Familias</p>
          <ul className={styles.menuFamilies}>
            {families
              .filter((family) => family.slug !== "del-taller" || showWorkshop)
              .map((family, position) => (
                <li key={family.slug} style={{ "--i": position } as React.CSSProperties}>
                  <Link href={`/productos?familia=${family.slug}`} onClick={() => setMenuOpen(false)}>
                    <span>{family.name}</span>
                    {panelFamilies.find((item) => item.slug === family.slug)?.count ? (
                      <small>{panelFamilies.find((item) => item.slug === family.slug)?.count}</small>
                    ) : null}
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
