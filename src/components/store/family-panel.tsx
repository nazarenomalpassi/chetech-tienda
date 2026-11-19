"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./family-panel.module.css";

export type PanelFamily = {
  slug: string;
  name: string;
  description: string;
  count: number;
  images: string[];
};

type Props = {
  ref: React.Ref<HTMLDivElement>;
  families: PanelFamily[];
  open: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClose: () => void;
};

const SHUTTERS = [0, 1, 2, 3, 4];

// Panel de familias del encabezado (escritorio). Cada familia es un canal: al apoyar el cursor sobre
// una, la pantalla de la derecha "sintoniza" sus productos más vendidos y se inclina hacia el cursor.
export function FamilyPanel({ ref, families, open, onEnter, onLeave, onClose }: Props) {
  const [active, setActive] = useState(0);
  // Las fotos se piden recién la primera vez que se abre el panel, no en cada carga de página.
  const [loaded, setLoaded] = useState(false);
  const screen = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const current = families[Math.min(active, families.length - 1)];

  if (open && !loaded) setLoaded(true);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const tilt = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || !screen.current) return;
    const node = screen.current;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const box = node.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (clientX - (box.left + box.width / 2)) / (box.width * 0.9)));
      const y = Math.max(-1, Math.min(1, (clientY - (box.top + box.height / 2)) / (box.height * 0.9)));
      node.style.setProperty("--x", x.toFixed(3));
      node.style.setProperty("--y", y.toFixed(3));
    });
  };

  const rest = () => {
    cancelAnimationFrame(frame.current);
    screen.current?.style.setProperty("--x", "0");
    screen.current?.style.setProperty("--y", "0");
  };

  return (
    <div
      id="panel-familias"
      ref={ref}
      className={`oscuro ${styles.panel}`}
      data-open={open}
      aria-hidden={!open}
      inert={!open}
      onPointerEnter={(event) => event.pointerType === "mouse" && onEnter()}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        rest();
        onLeave();
      }}
      onPointerMove={tilt}
      onFocus={onEnter}
      onBlur={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && onLeave()}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        onClose();
        document.querySelector<HTMLElement>("[aria-controls='panel-familias']")?.focus();
      }}
    >
      <div className={`page ${styles.inner}`}>
        <nav aria-label="Familias de productos">
          <ul className={styles.list} style={{ "--active": active } as React.CSSProperties}>
            <li className={styles.marker} aria-hidden />
            {families.map((family, position) => (
              <li key={family.slug} style={{ "--i": position } as React.CSSProperties}>
                <Link
                  href={`/productos?familia=${family.slug}`}
                  className={styles.item}
                  data-active={position === active}
                  onPointerEnter={() => setActive(position)}
                  onFocus={() => setActive(position)}
                  onClick={onClose}
                >
                  <span className={styles.itemChannel} aria-hidden>
                    CH {String(position + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.itemName}>{family.name}</span>
                  <span className={styles.itemCount}>
                    {family.count}
                    <span className="visually-hidden"> productos</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.preview} aria-hidden>
          <div className={styles.screen} ref={screen}>
            <div className={styles.osd}>
              <span key={active} className={styles.osdChannel}>
                CH {String(active + 1).padStart(2, "0")}
              </span>
              <span className={styles.signal}>
                <i />
                <i />
                <i />
                <i />
              </span>
            </div>
            {loaded ? (
              <div key={current.slug} className={styles.pictures}>
                {current.images.map((image, position) => (
                  <span key={image} className={styles.picture} style={{ "--i": position } as React.CSSProperties}>
                    <Image src={image} alt="" fill sizes="180px" />
                  </span>
                ))}
              </div>
            ) : null}
            <div key={`franjas-${active}`} className={styles.shutters}>
              {SHUTTERS.map((shutter) => (
                <span key={shutter} style={{ "--i": shutter } as React.CSSProperties} />
              ))}
            </div>
            <div className={styles.scanlines} />
            <div className={styles.glare} />
          </div>
          <p key={`texto-${active}`} className={styles.description}>
            {current.description}
          </p>
        </div>
      </div>
      <div className={styles.foot}>
        <div className={`page ${styles.footInner}`}>
          <Link href="/productos" className={styles.all} onClick={onClose}>
            Ver todos los productos
          </Link>
          <span className={styles.hint} aria-hidden>
            Retiro gratis en Independencia 784, Río Tercero
          </span>
        </div>
      </div>
    </div>
  );
}
