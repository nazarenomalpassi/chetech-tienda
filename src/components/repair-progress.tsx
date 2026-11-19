import styles from "./repair-progress.module.css";

// Las etapas siguen los estados reales del taller, en el orden en que pasan.
const stages = [
  { status: "pendiente_revision", label: "Recibido" },
  { status: "en_revision", label: "Diagnóstico" },
  { status: "presupuestado", label: "Presupuesto" },
  { status: "presupuestado_aceptado", label: "Reparación" },
  { status: "listo_para_retirar", label: "Listo para retirar" },
];

type Props = {
  status: string;
  /** Versión chica para las tarjetas del listado: solo nombra la etapa actual. */
  compact?: boolean;
  /** Con marco propio, para ir suelta entre los bloques del detalle. */
  boxed?: boolean;
};

/** Riel de avance de una reparación. No se dibuja si la reparación se cerró sin arreglo (presupuesto
 *  rechazado o sin solución) ni con un estado que no conoce: ahí el riel diría algo que no es cierto. */
export function RepairProgress({ status, compact = false, boxed = false }: Props) {
  const index = stages.findIndex((stage) => stage.status === status);
  const delivered = status === "retirado";
  if (!delivered && index < 0) return null;

  const current = delivered ? stages.length : index;
  const progress = delivered ? 1 : index / (stages.length - 1);
  const summary = delivered
    ? "Reparación entregada: se completaron las cinco etapas."
    : `Etapa ${index + 1} de ${stages.length}: ${stages[index].label}.`;

  return (
    <div
      className={styles.progress}
      data-compact={compact || undefined}
      data-boxed={boxed || undefined}
      data-delivered={delivered || undefined}
      style={{ "--progress": progress } as React.CSSProperties}
    >
      <p className="visually-hidden">{summary}</p>
      <div className={styles.rail} aria-hidden>
        <span className={styles.fill} />
        <ol className={styles.stages}>
          {stages.map((stage, position) => (
            <li
              key={stage.status}
              data-state={position < current ? "hecho" : position === current ? "actual" : "falta"}
              style={{ "--i": position } as React.CSSProperties}
            >
              <span className={styles.mark} />
              <span className={styles.name}>{stage.label}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className={styles.caption} aria-hidden>
        {delivered ? (
          <strong>Entregada</strong>
        ) : (
          <>
            <span>
              Etapa {index + 1} de {stages.length}
            </span>
            <strong>{stages[index].label}</strong>
          </>
        )}
      </p>
    </div>
  );
}
