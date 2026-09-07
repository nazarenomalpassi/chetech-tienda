"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function RepairsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="empty-state repair-empty-state" role="alert">
      <AlertTriangle aria-hidden="true" />
      <h2>No pudimos cargar tus reparaciones.</h2>
      <p>Puede ser un inconveniente momentáneo. Volvé a intentarlo en unos segundos.</p>
      <button className="button primary" onClick={reset} type="button">
        <RotateCcw aria-hidden="true" />
        Reintentar
      </button>
    </div>
  );
}
