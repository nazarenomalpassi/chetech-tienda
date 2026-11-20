"use client";

import { useEffect, useRef } from "react";
import styles from "./repair-story.module.css";

const steps = [
  { title: "Diagnóstico", text: "Revisamos el equipo y encontramos la falla." },
  { title: "Presupuesto", text: "Te mandamos el precio y vos decidís si seguimos." },
  { title: "Reparación", text: "Cambiamos lo que hace falta, con repuestos probados." },
  { title: "Prueba", text: "La dejamos encendida en el banco de pruebas." },
  { title: "Entrega", text: "La retirás en el local o te la llevamos." },
];

type Props = {
  /** Botones al pie de los pasos. */
  actions?: React.ReactNode;
  /** Título y bajada. Sin estos, van los de la portada. */
  title?: string;
  lead?: string;
  /** Clase del contenedor que alinea el tramo con el resto de la página. */
  container?: string;
  /** Alto de lo que esa página deja fijo debajo del encabezado (por ejemplo, la barra de categorías). */
  pinOffset?: string;
};

// E3 · De rota a reparada: el televisor queda fijo mientras se desplaza la página y la imagen se
// limpia hasta verse perfecta. GSAP se descarga recién cuando el tramo se acerca.
export function RepairStory({
  actions,
  title = "De rota a reparada",
  lead = "Somos el taller de televisores de Río Tercero. Arreglamos teles, microondas, parlantes, celulares y notebooks, y seguís cada paso desde tu cuenta.",
  container = "page",
  pinOffset,
}: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const pin = pinRef.current;
    if (!section || !pin) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      section.dataset.static = "true";
      return;
    }

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    const start = async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      section.dataset.enhanced = "true";
      // El televisor queda fijo con position: sticky; GSAP solo traduce el desplazamiento en avance.
      const trigger = ScrollTrigger.create({
        trigger: pin,
        start: "top 70%",
        end: "bottom 75%",
        scrub: 0.4,
        onUpdate: (self) => {
          const progress = self.progress;
          section.style.setProperty("--repair", progress.toFixed(3));
          section.dataset.step = String(Math.min(steps.length - 1, Math.floor(progress * steps.length * 0.999)));
        },
      });
      cleanup = () => trigger.kill();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void start();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(section);

    return () => {
      cancelled = true;
      observer.disconnect();
      cleanup?.();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`oscuro ${styles.section}`}
      aria-labelledby="taller-titulo"
      data-step="0"
      style={pinOffset ? ({ "--pin-extra": pinOffset } as React.CSSProperties) : undefined}
    >
      <div ref={pinRef} className={styles.pin}>
        <div className={`${container} ${styles.grid}`}>
          <div className={styles.tvColumn} aria-hidden>
            {(["before", "after"] as const).map((role) => (
              <figure key={role} className={styles.tvFigure} data-role={role}>
                <div className={styles.tv}>
                  <div className={styles.screen}>
                    <div className={styles.signal}>
                      <span className={styles.bars} />
                      <span className={`${styles.bars} ${styles.tear1}`} />
                      <span className={`${styles.bars} ${styles.tear2}`} />
                      <span className={styles.noise} />
                      <span className={styles.roll} />
                    </div>
                    <span className={styles.ok}>Probada y lista</span>
                  </div>
                </div>
                <figcaption>{role === "before" ? "Así llega" : "Así sale"}</figcaption>
              </figure>
            ))}
          </div>

          <div className={styles.copy}>
            <h2 id="taller-titulo">{title}</h2>
            <p className={styles.lead}>{lead}</p>
            <ol className={styles.steps}>
              {steps.map((step, index) => (
                <li key={step.title} data-index={index}>
                  <span className={styles.stepMark} aria-hidden />
                  <span>
                    <strong>{step.title}</strong>
                    <span>{step.text}</span>
                  </span>
                </li>
              ))}
            </ol>
            {actions ? <div className={styles.actions}>{actions}</div> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
