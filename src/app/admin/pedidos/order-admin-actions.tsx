"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveOrderNotesAction,
  storefrontOrderAction,
  type AdminActionState,
} from "@/app/admin-actions";
import styles from "./orders.module.css";

export type AdminOrderSummary = {
  id: string;
  status: string;
  payment_method: string | null;
  payment_status: string;
  delivery_method: string;
  transfer_reported_at: string | null;
  needs_attention: string | null;
  admin_notes: string | null;
};

function Submit({ children, variant }: { children: React.ReactNode; variant?: "secondary" | "quiet" }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" data-variant={variant} disabled={pending} aria-busy={pending}>
      {pending ? "Aplicando…" : children}
    </button>
  );
}

function Message({ state }: { state: AdminActionState }) {
  if (state.error)
    return (
      <p className={styles.message} data-kind="error" role="alert">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p className={styles.message} data-kind="ok" role="status">
        {state.message}
      </p>
    );
  return null;
}

function ActionForm({
  order,
  action,
  title,
  help,
  button,
  variant,
  danger,
  children,
}: {
  order: AdminOrderSummary;
  action: string;
  title: string;
  help: string;
  button: string;
  variant?: "secondary" | "quiet";
  danger?: boolean;
  children?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(storefrontOrderAction, {});
  const body = (
    <form action={formAction} className={styles.action}>
      <input type="hidden" name="id" value={order.id} />
      <input type="hidden" name="action" value={action} />
      {!danger ? <strong>{title}</strong> : null}
      <p>{help}</p>
      {children}
      <Submit variant={variant}>{button}</Submit>
      <Message state={state} />
    </form>
  );
  if (!danger) return body;
  return (
    <details className={`${styles.action} ${styles.danger}`}>
      <summary>{title}</summary>
      {body}
    </details>
  );
}

const PAYMENT_OPTIONS = [
  ["efectivo", "Efectivo"],
  ["transferencia", "Transferencia"],
  ["mp", "Mercado Pago"],
  ["nx", "Naranja X"],
  ["otro", "Otro"],
] as const;

export function OrderAdminActions({ order }: { order: AdminOrderSummary }) {
  const paid = order.payment_status === "approved";
  const open = !["completed", "cancelled", "expired", "returned"].includes(order.status);
  const pickup = order.delivery_method === "pickup";
  const awaiting = order.status === "awaiting_payment";
  const payAtPickup = order.payment_method === "pickup";

  const forms: React.ReactNode[] = [];

  if (order.needs_attention) {
    forms.push(
      <ActionForm
        key="clear"
        order={order}
        action="clear_attention"
        title="Marcar el aviso como resuelto"
        help="Usalo cuando ya revisaste el problema (devolución hecha, stock corregido o venta cargada a mano)."
        button="Marcar resuelto"
        variant="secondary"
      />,
    );
  }

  if (awaiting && order.payment_method === "transfer") {
    forms.push(
      <ActionForm
        key="transfer"
        order={order}
        action="confirm_transfer"
        title="Confirmar la transferencia"
        help={
          order.transfer_reported_at
            ? "El cliente avisó que transfirió. Confirmalo solo después de ver la plata en la cuenta."
            : "Confirmalo solo después de ver la plata en la cuenta."
        }
        button="Confirmar que llegó la transferencia"
      />,
    );
  }

  if (open && (paid || (awaiting && payAtPickup)) && order.status !== "preparing" && order.status !== "ready_for_pickup" && order.status !== "shipped") {
    forms.push(
      <ActionForm
        key="preparing"
        order={order}
        action="mark_preparing"
        title="Empezar a preparar"
        help="Le avisa al cliente que estás armando su pedido."
        button="Pasar a preparación"
        variant="secondary"
      />,
    );
  }

  if (open && pickup && (paid || payAtPickup) && order.status !== "ready_for_pickup") {
    forms.push(
      <ActionForm
        key="ready"
        order={order}
        action="mark_ready"
        title="Listo para retirar"
        help="Genera un código de retiro de 6 números y se lo manda al cliente por mail."
        button="Marcar listo para retirar"
      />,
    );
  }

  if (open && !pickup && paid && ["paid", "preparing"].includes(order.status)) {
    forms.push(
      <ActionForm
        key="shipped"
        order={order}
        action="mark_shipped"
        title="Despachar"
        help="Cargá el seguimiento si lo tenés. Le mandamos el mail de despacho al cliente."
        button="Marcar despachado"
      >
        <label>
          Código de seguimiento
          <input name="trackingCode" maxLength={60} autoComplete="off" />
        </label>
        <label>
          Enlace de seguimiento
          <input name="trackingUrl" type="url" maxLength={500} placeholder="https://" />
        </label>
      </ActionForm>,
    );
  }

  if (open && (paid ? ["paid", "preparing", "ready_for_pickup", "shipped"].includes(order.status) : payAtPickup)) {
    forms.push(
      <ActionForm
        key="delivered"
        order={order}
        action="mark_delivered"
        title="Entregado"
        help={
          paid
            ? "Cierra el pedido. A los 3 días le pedimos una reseña al cliente."
            : "Registra el cobro en la gestión con el medio que elijas y cierra el pedido."
        }
        button={paid ? "Marcar entregado" : "Cobrar y entregar"}
      >
        {!paid ? (
          <label>
            Con qué pagó
            <select name="gestionMethod" required defaultValue="">
              <option value="" disabled>
                Elegí un medio
              </option>
              {PAYMENT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </ActionForm>,
    );
  }

  if (open && !paid) {
    forms.push(
      <ActionForm
        key="cancel"
        order={order}
        action="cancel"
        title="Cancelar el pedido"
        help="Libera el stock reservado y le avisa al cliente. No se puede deshacer."
        button="Cancelar el pedido"
        variant="secondary"
        danger
      >
        <label>
          Motivo interno
          <input name="reason" maxLength={500} />
        </label>
        <label>
          Mensaje para el cliente
          <input name="customerNote" maxLength={500} placeholder="Cancelamos tu pedido." />
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="confirm" /> Confirmo que quiero cancelarlo
        </label>
      </ActionForm>,
    );
  }

  if (paid && order.status !== "returned") {
    forms.push(
      <ActionForm
        key="returned"
        order={order}
        action="mark_returned"
        title="Registrar una devolución"
        help="Primero devolvé el pago y anulá la venta en la gestión. Esto solo deja el pedido como devuelto."
        button="Marcar devuelto"
        variant="secondary"
        danger
      >
        <label>
          Motivo
          <input name="reason" maxLength={500} />
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="confirm" /> Ya devolví el pago y anulé la venta
        </label>
      </ActionForm>,
    );
  }

  return (
    <div className={styles.actions}>
      {forms.length ? forms : <p>Este pedido está cerrado. No hay acciones pendientes.</p>}
    </div>
  );
}

export function OrderNotes({ order }: { order: AdminOrderSummary }) {
  const [state, action] = useActionState(saveOrderNotesAction, {});
  return (
    <form action={action} className={styles.notes}>
      <input type="hidden" name="id" value={order.id} />
      <label htmlFor="admin-notes">Solo la ve Administración</label>
      <textarea id="admin-notes" name="adminNotes" rows={4} maxLength={4000} defaultValue={order.admin_notes ?? ""} />
      <Submit variant="secondary">Guardar nota</Submit>
      <Message state={state} />
    </form>
  );
}
