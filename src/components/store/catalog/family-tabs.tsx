"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./family-tabs.module.css";

type Tab = { slug: string | null; name: string; count?: number; href: string };

type Props = { tabs: Tab[]; active: string | null };

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// Familias del catálogo. Un bloque blanco se desliza hasta la familia elegida apenas se la toca,
// sin esperar a que cargue la página: la respuesta al toque es inmediata.
export function FamilyTabs({ tabs, active }: Props) {
  const nav = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  // La elección optimista vale hasta que la página confirma (o cambia) la familia activa.
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const [confirmed, setConfirmed] = useState(active);
  if (confirmed !== active) {
    setConfirmed(active);
    setPicked(undefined);
  }
  const shown = picked !== undefined ? picked : active;

  useIsomorphicLayoutEffect(() => {
    const container = track.current;
    if (!container) return;
    const place = (scroll: boolean) => {
      const link = container.querySelector<HTMLElement>("[data-shown='true']");
      if (!link) return;
      container.style.setProperty("--l", `${link.offsetLeft}px`);
      container.style.setProperty("--r", `${container.offsetWidth - link.offsetLeft - link.offsetWidth}px`);
      container.dataset.ready = "true";
      const scroller = nav.current;
      if (scroll && scroller && scroller.scrollWidth > scroller.clientWidth) {
        const target = link.offsetLeft - (scroller.clientWidth - link.offsetWidth) / 2;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        scroller.scrollTo({ left: Math.max(0, target), behavior: reduce ? "auto" : "smooth" });
      }
    };
    place(true);
    const observer = new ResizeObserver(() => place(false));
    observer.observe(container);
    return () => observer.disconnect();
  }, [shown, tabs.length]);

  return (
    <nav className={styles.families} aria-label="Familias" ref={nav}>
      <div className={styles.track} ref={track}>
        <span className={styles.indicator} aria-hidden />
        {tabs.map((tab) => (
          <Link
            key={tab.slug ?? "todas"}
            href={tab.href}
            aria-current={active === tab.slug ? "page" : undefined}
            data-shown={shown === tab.slug}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              setPicked(tab.slug);
            }}
          >
            {tab.name}
            {tab.count !== undefined ? <span>{tab.count}</span> : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}
