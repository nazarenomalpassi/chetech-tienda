"use client";

import { useEffect, useState } from "react";
import { storeStatus, todayAtStore } from "@/lib/hours";
import styles from "./hours-live.module.css";

type Snapshot = { status: ReturnType<typeof storeStatus>; today: ReturnType<typeof todayAtStore> };

// La hora del local se calcula en el navegador y se refresca cada medio minuto: el estado de
// "abierto" es el de este momento, no el de cuando se armó la página.
function useStoreClock() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => {
    const update = () => setSnapshot({ status: storeStatus(), today: todayAtStore() });
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return snapshot;
}

function statusText(status: Snapshot["status"]) {
  if (status.open) {
    return status.minutesLeft <= 30
      ? { lead: "Abierto ahora", detail: `cerramos en ${status.minutesLeft} min` }
      : { lead: "Abierto ahora", detail: `hasta las ${status.closesAt}` };
  }
  return { lead: "Cerrado ahora", detail: `abrimos ${status.day} a las ${status.opensAt}` };
}

/** Píldora con el estado del local, para el encabezado. */
export function OpenStatus() {
  const snapshot = useStoreClock();
  if (!snapshot) {
    return (
      <p className={styles.status} data-state="cargando">
        <span className={styles.dot} aria-hidden />
        <span>Horarios del local</span>
      </p>
    );
  }
  const text = statusText(snapshot.status);
  return (
    <p
      className={styles.status}
      data-state={snapshot.status.open ? "abierto" : "cerrado"}
      role="status"
    >
      <span className={styles.dot} aria-hidden />
      <strong>{text.lead}</strong>
      <span>{text.detail}</span>
    </p>
  );
}

const DAY_START = 8 * 60;
const DAY_END = 21 * 60;
const ROW_OF_DAY = [2, 0, 0, 0, 0, 0, 1];

type Row = { label: string; value: string };

/** Tabla de horarios con el día de hoy marcado y una línea de tiempo del día con la hora actual. */
export function HoursBoard({ rows }: { rows: readonly Row[] }) {
  const snapshot = useStoreClock();
  const todayRow = snapshot ? ROW_OF_DAY[snapshot.today.day] : -1;
  const span = DAY_END - DAY_START;
  const position = (minutes: number) => Math.max(0, Math.min(1, (minutes - DAY_START) / span));

  return (
    <div className={styles.board}>
      <dl className={styles.rows}>
        {rows.map((row, index) => (
          <div key={row.label} data-today={index === todayRow || undefined}>
            <dt>
              {row.label}
              {index === todayRow ? <span className={styles.today}>Hoy</span> : null}
            </dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.timeline} data-ready={snapshot ? "true" : undefined}>
        <p className={styles.timelineTitle}>
          {snapshot
            ? snapshot.today.spans.length
              ? "El día de hoy"
              : "Hoy el local no abre"
            : "El día de hoy"}
        </p>
        <div className={styles.track} aria-hidden>
          {snapshot?.today.spans.map((item, index) => (
            <span
              key={item.start}
              className={styles.segment}
              style={
                {
                  "--from": `${position(item.start) * 100}%`,
                  "--size": `${(position(item.end) - position(item.start)) * 100}%`,
                  "--i": index,
                } as React.CSSProperties
              }
            />
          ))}
          {snapshot ? (
            <span
              className={styles.needle}
              style={
                { "--at": `${position(snapshot.today.minutes) * 100}%` } as React.CSSProperties
              }
            >
              <i>Ahora</i>
            </span>
          ) : null}
        </div>
        <div className={styles.scale} aria-hidden>
          <span>08</span>
          <span>12</span>
          <span>16</span>
          <span>20</span>
        </div>
        {snapshot ? (
          <p className="visually-hidden">
            {snapshot.today.spans.length
              ? `Hoy atendemos de ${snapshot.today.spans.map((item) => `${item.opens} a ${item.closes}`).join(" y de ")}.`
              : "Hoy el local no abre."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
