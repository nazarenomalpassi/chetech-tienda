"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { updateRequestAction, type InboxActionState } from "./inbox-actions";
import styles from "./inbox.module.css";

/** Botón de un formulario que se deshabilita mientras se guarda. */
export function PendingButton({
  children,
  pendingLabel = "Guardando…",
  variant,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "secondary" | "quiet";
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" data-variant={variant} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Botón que pide una segunda confirmación en el mismo lugar antes de mandar (sin ventanas del navegador). */
export function ConfirmButton({
  children,
  confirmLabel,
}: {
  children: React.ReactNode;
  confirmLabel: string;
}) {
  const { pending } = useFormStatus();
  const armed = useRef<HTMLSpanElement>(null);
  return (
    <span className={styles.confirm} ref={armed} data-armed="false">
      <button
        type="button"
        className={styles.linkButton}
        onClick={() => armed.current?.setAttribute("data-armed", "true")}
        disabled={pending}
      >
        {children}
      </button>
      <span className={styles.confirmAsk}>
        <button type="submit" className={styles.linkButton} data-danger="true" disabled={pending}>
          {pending ? "Quitando…" : confirmLabel}
        </button>
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => armed.current?.setAttribute("data-armed", "false")}
        >
          Cancelar
        </button>
      </span>
    </span>
  );
}

const statusOptions = [
  ["in_review", "En revisión"],
  ["responded", "Respondida"],
  ["resolved", "Resuelta"],
  ["rejected_with_reason", "Rechazada con motivo"],
  ["received", "Recibida (sin tocar)"],
] as const;

/** Cambio de estado de una solicitud, con una nota opcional que queda en el historial. */
export function RequestStatusForm({ id, status }: { id: string; status: string }) {
  const [state, action] = useActionState<InboxActionState, FormData>(updateRequestAction, {});
  return (
    <form action={action} className={styles.statusForm}>
      <input type="hidden" name="id" value={id} />
      <label>
        Pasar a
        <select name="status" defaultValue={status === "received" ? "in_review" : status}>
          {statusOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.note}>
        Nota para el historial (obligatoria si la rechazás)
        <textarea name="note" rows={2} maxLength={1000} />
      </label>
      <div className={styles.formFoot}>
        <PendingButton>Guardar</PendingButton>
        {state.error ? (
          <p className={styles.message} data-kind="error" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.message ? (
          <p className={styles.message} data-kind="ok" role="status">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
