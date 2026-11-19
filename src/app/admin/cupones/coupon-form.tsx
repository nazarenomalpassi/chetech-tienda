"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveCouponAction, type AdminActionState } from "@/app/admin-actions";
import styles from "./coupons.module.css";

export type CouponRow = {
  id: string;
  code: string;
  label: string;
  origin: "general" | "reel" | "taller" | "mostrador";
  percent: number;
  scope: "all" | "accessories";
  min_subtotal: number;
  max_discount: number | null;
  max_uses: number | null;
  once_per_customer: boolean;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  uses: number;
  paid_orders: number;
  revenue: number;
  discount_given: number;
};

type Draft = {
  code: string;
  label: string;
  origin: CouponRow["origin"];
  percent: string;
  scope: CouponRow["scope"];
  minSubtotal: string;
  maxDiscount: string;
  maxUses: string;
  oncePerCustomer: boolean;
  endsOn: string;
  isActive: boolean;
};

const emptyDraft: Draft = {
  code: "",
  label: "",
  origin: "general",
  percent: "10",
  scope: "all",
  minSubtotal: "",
  maxDiscount: "",
  maxUses: "",
  oncePerCustomer: true,
  endsOn: "",
  isActive: true,
};

/** Fecha local de Córdoba (AAAA-MM-DD) a tantos días de hoy. */
function dateInDays(days: number) {
  const target = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" }).format(target);
}

const presets: { title: string; detail: string; build: () => Partial<Draft> }[] = [
  {
    title: "Para un reel",
    detail: "10 % en todo, 14 días. El código se dice en el video.",
    build: () => ({ origin: "reel", percent: "10", scope: "all", endsOn: dateInDays(14), label: "Reel" }),
  },
  {
    title: "Clientes del taller",
    detail: "10 % en accesorios, 30 días. Va en el comprobante de retiro.",
    build: () => ({ origin: "taller", percent: "10", scope: "accessories", endsOn: dateInDays(30), label: "Clientes del taller" }),
  },
  {
    title: "Mostrador",
    detail: "5 % en accesorios, 30 días. Para dar en mano con la compra.",
    build: () => ({ origin: "mostrador", percent: "5", scope: "accessories", endsOn: dateInDays(30), label: "Mostrador" }),
  },
];

function draftFrom(coupon: CouponRow): Draft {
  return {
    code: coupon.code,
    label: coupon.label,
    origin: coupon.origin,
    percent: String(Number(coupon.percent)),
    scope: coupon.scope,
    minSubtotal: Number(coupon.min_subtotal) > 0 ? String(Math.round(Number(coupon.min_subtotal))) : "",
    maxDiscount: coupon.max_discount ? String(Math.round(Number(coupon.max_discount))) : "",
    maxUses: coupon.max_uses ? String(coupon.max_uses) : "",
    oncePerCustomer: coupon.once_per_customer,
    endsOn: coupon.ends_at
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" }).format(new Date(coupon.ends_at))
      : "",
    isActive: coupon.is_active,
  };
}

function Submit({ label, state }: { label: string; state: AdminActionState }) {
  const { pending } = useFormStatus();
  return (
    <div className={styles.footer}>
      <button className="btn" disabled={pending} aria-busy={pending}>
        {pending ? "Guardando…" : label}
      </button>
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
  );
}

export function CouponForm({ coupon }: { coupon?: CouponRow }) {
  const [state, action] = useActionState(saveCouponAction, {});
  const [draft, setDraft] = useState<Draft>(coupon ? draftFrom(coupon) : emptyDraft);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const editing = Boolean(coupon);

  return (
    <form action={action} className={styles.form}>
      {coupon ? (
        <>
          <input type="hidden" name="id" value={coupon.id} />
          <input type="hidden" name="startsAt" value={coupon.starts_at} />
        </>
      ) : (
        <fieldset className={styles.presets}>
          <legend>Empezá con una base</legend>
          {presets.map((preset) => (
            <button key={preset.title} type="button" onClick={() => setDraft((current) => ({ ...current, ...preset.build() }))}>
              <strong>{preset.title}</strong>
              <small>{preset.detail}</small>
            </button>
          ))}
        </fieldset>
      )}

      <div className={styles.fields}>
        <label>
          Código
          <input
            name="code"
            value={draft.code}
            onChange={(event) => set("code", event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            maxLength={20}
            required
            readOnly={editing}
            autoComplete="off"
            spellCheck={false}
            placeholder="REEL10"
            aria-describedby={editing ? undefined : "codigo-ayuda"}
          />
          {editing ? null : <small id="codigo-ayuda">Corto y fácil de decir. Después no se puede cambiar.</small>}
        </label>
        <label>
          Descuento (%)
          <input
            name="percent"
            type="number"
            min={1}
            max={50}
            step={1}
            inputMode="numeric"
            value={draft.percent}
            onChange={(event) => set("percent", event.target.value)}
            required
          />
        </label>
        <label>
          Aplica a
          <select name="scope" value={draft.scope} onChange={(event) => set("scope", event.target.value as Draft["scope"])}>
            <option value="all">Todos los productos</option>
            <option value="accessories">Accesorios (sin televisores)</option>
          </select>
        </label>
        <label>
          De dónde sale
          <select name="origin" value={draft.origin} onChange={(event) => set("origin", event.target.value as Draft["origin"])}>
            <option value="general">General</option>
            <option value="reel">Reel o historia</option>
            <option value="taller">Clientes del taller</option>
            <option value="mostrador">Mostrador</option>
          </select>
        </label>
        <label>
          Vence el
          <input name="endsOn" type="date" value={draft.endsOn} onChange={(event) => set("endsOn", event.target.value)} />
          <small>Vacío: no vence.</small>
        </label>
        <label>
          Usos en total
          <input
            name="maxUses"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={draft.maxUses}
            onChange={(event) => set("maxUses", event.target.value)}
            placeholder="Sin tope"
          />
        </label>
        <label>
          Compra mínima ($)
          <input
            name="minSubtotal"
            inputMode="numeric"
            value={draft.minSubtotal}
            onChange={(event) => set("minSubtotal", event.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="Sin mínimo"
          />
        </label>
        <label>
          Tope del descuento ($)
          <input
            name="maxDiscount"
            inputMode="numeric"
            value={draft.maxDiscount}
            onChange={(event) => set("maxDiscount", event.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="Sin tope"
          />
        </label>
        <label className={styles.wide}>
          Nota interna
          <input
            name="label"
            value={draft.label}
            onChange={(event) => set("label", event.target.value)}
            maxLength={120}
            placeholder="Reel de cargadores de noviembre"
          />
        </label>
      </div>

      <div className={styles.toggles}>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            name="oncePerCustomer"
            checked={draft.oncePerCustomer}
            onChange={(event) => set("oncePerCustomer", event.target.checked)}
          />
          Un uso por cliente
        </label>
        <label className={styles.toggle}>
          <input type="checkbox" name="isActive" checked={draft.isActive} onChange={(event) => set("isActive", event.target.checked)} />
          Activo
        </label>
      </div>

      <Submit state={state} label={editing ? "Guardar cambios" : "Crear cupón"} />
    </form>
  );
}
