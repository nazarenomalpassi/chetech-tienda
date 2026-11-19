"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./repair-demo.module.css";

const steps = [
  { title: "Diagnóstico", text: "Revisamos el equipo y encontramos la falla." },
  { title: "Presupuesto", text: "Te mandamos el precio y vos decidís si seguimos." },
  { title: "Reparación", text: "Cambiamos lo que hace falta, con repuestos probados." },
  { title: "Prueba", text: "La dejamos encendida en el banco de pruebas." },
  { title: "Entrega", text: "La retirás en el local o te la llevamos." },
];

const STEP_SECONDS = 2.6;

// Demostración del seguimiento de una reparación: los cinco pasos avanzan solos y se pueden tocar.
// Es un ejemplo (lo dice el rótulo): no muestra datos de nadie. Se detiene fuera de pantalla, con la
// pestaña oculta, con el cursor encima o con foco de teclado; con "reducir movimiento" no avanza sola.
export function RepairDemo() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [announce, setAnnounce] = useState("");
  const [held, setHeld] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.4,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (held || !visible) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setActive((value) => (value + 1) % steps.length);
    }, STEP_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [held, visible]);

  const pick = (index: number) => {
    setActive(index);
    setAnnounce(
      `Paso ${index + 1} de ${steps.length}: ${steps[index].title}. ${steps[index].text}`,
    );
  };

  return (
    <div
      ref={root}
      className={`oscuro ${styles.demo}`}
      data-running={!held && visible}
      style={
        {
          "--progress": active / (steps.length - 1),
          "--step-seconds": `${STEP_SECONDS}s`,
        } as React.CSSProperties
      }
      onPointerEnter={(event) => event.pointerType === "mouse" && setHeld(true)}
      onPointerLeave={(event) => event.pointerType === "mouse" && setHeld(false)}
      onFocus={(event) => event.target.matches(":focus-visible") && setHeld(true)}
      onBlur={(event) =>
        !event.currentTarget.contains(event.relatedTarget as Node | null) && setHeld(false)
      }
    >
      <div className={styles.top}>
        <p className={styles.caption}>Así se ve el seguimiento</p>
        <span className={styles.tag}>Ejemplo</span>
      </div>

      <div className={styles.device}>
        <span className={styles.deviceName}>Televisor de 50 pulgadas</span>
        <span className={styles.counter} aria-hidden>
          <b key={active}>{String(active + 1).padStart(2, "0")}</b>/
          {String(steps.length).padStart(2, "0")}
        </span>
      </div>

      <div className={styles.rail}>
        <span className={styles.railFill} aria-hidden />
        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <li
              key={step.title}
              data-state={index < active ? "hecho" : index === active ? "actual" : "falta"}
            >
              <button
                type="button"
                onClick={() => pick(index)}
                aria-current={index === active ? "step" : undefined}
                aria-label={`Paso ${index + 1}: ${step.title}`}
              >
                <span className={styles.mark} aria-hidden />
                <span className={styles.stepName} aria-hidden>
                  {step.title}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.now}>
        <p key={active} className={styles.nowText}>
          <strong>{steps[active].title}</strong>
          <span>{steps[active].text}</span>
        </p>
        <span key={`barra-${active}`} className={styles.timer} aria-hidden />
      </div>

      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
