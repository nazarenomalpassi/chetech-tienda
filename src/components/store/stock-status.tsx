import type { ProductStatus } from "@/lib/types";
import styles from "./stock-status.module.css";

const labels: Record<ProductStatus, { text: string; short: string; tone: "ok" | "low" | "out" | "ask" }> = {
  Disponible: { text: "Disponible", short: "Disponible", tone: "ok" },
  "Últimas unidades": { text: "Últimas unidades", short: "Últimas", tone: "low" },
  "Sin stock": { text: "Sin stock", short: "Sin stock", tone: "out" },
  "Consultar disponibilidad": { text: "Consultar disponibilidad", short: "Consultar", tone: "ask" },
};

export function StockStatus({ status, compact = false }: { status: ProductStatus; compact?: boolean }) {
  const label = labels[status] ?? labels["Consultar disponibilidad"];
  return (
    <span className={styles.status} data-tone={label.tone}>
      <span className={styles.dot} aria-hidden />
      {compact ? label.short : label.text}
    </span>
  );
}
