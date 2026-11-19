"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveCheckoutSettingsAction,
  saveDeliverySettingsAction,
  savePromoSettingsAction,
  type AdminActionState,
} from "@/app/admin-actions";
import styles from "./settings.module.css";

type Json = Record<string, unknown>;

function get(source: unknown, path: string[]): unknown {
  return path.reduce<unknown>(
    (value, key) => (value && typeof value === "object" ? (value as Json)[key] : undefined),
    source,
  );
}

const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const bool = (value: unknown) => value === true;

function Footer({ state, label }: { state: AdminActionState; label: string }) {
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

function Toggle({ name, label, defaultChecked, disabled }: { name: string; label: string; defaultChecked: boolean; disabled?: boolean }) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} />
      {label}
    </label>
  );
}

function Field({
  name,
  label,
  defaultValue,
  ...props
}: { name: string; label: string; defaultValue: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      {label}
      <input name={name} defaultValue={defaultValue} {...props} />
    </label>
  );
}

export function CheckoutSettingsForm({ value, mercadopagoReady }: { value: unknown; mercadopagoReady: boolean }) {
  const [state, action] = useActionState(saveCheckoutSettingsAction, {});
  return (
    <form action={action} className={styles.form}>
      <h2>Cobros</h2>
      <p>Cada medio aparece en la compra solo cuando está activo y tiene sus datos completos.</p>

      <fieldset className={styles.group}>
        <legend>Mercado Pago</legend>
        <p>
          {mercadopagoReady
            ? "Las credenciales están cargadas. Mientras no actives los pagos reales en Railway, Mercado Pago funciona en modo de prueba."
            : "Faltan las credenciales en Railway (MERCADOPAGO_ACCESS_TOKEN y MERCADOPAGO_WEBHOOK_SECRET). Hasta entonces no se puede activar."}
        </p>
        <Toggle
          name="mercadopagoEnabled"
          label="Ofrecer Mercado Pago"
          defaultChecked={bool(get(value, ["mercadopago", "enabled"]))}
          disabled={!mercadopagoReady}
        />
        <div className={styles.fields}>
          <Field
            name="mercadopagoMinutes"
            label="Minutos de reserva mientras paga"
            type="number"
            min={10}
            max={120}
            defaultValue={str(get(value, ["mercadopago_reservation_minutes"]) ?? 30)}
          />
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Transferencia</legend>
        <p>El cliente ve estos datos en su pedido y en el mail. Confirmás cada transferencia desde Pedidos.</p>
        <Toggle
          name="transferEnabled"
          label="Ofrecer transferencia"
          defaultChecked={bool(get(value, ["transfer", "enabled"]))}
        />
        <div className={styles.fields}>
          <Field name="transferAlias" label="Alias" maxLength={60} defaultValue={str(get(value, ["transfer", "alias"]))} />
          <Field
            name="transferCvu"
            label="CVU o CBU"
            inputMode="numeric"
            maxLength={30}
            defaultValue={str(get(value, ["transfer", "cvu"]))}
          />
          <Field name="transferHolder" label="Titular" maxLength={120} defaultValue={str(get(value, ["transfer", "holder"]))} />
          <Field name="transferCuit" label="CUIT" maxLength={20} defaultValue={str(get(value, ["transfer", "cuit"]))} />
          <Field name="transferBank" label="Banco o billetera" maxLength={80} defaultValue={str(get(value, ["transfer", "bank"]))} />
          <Field
            name="offlineHours"
            label="Horas de reserva (hábiles del local)"
            type="number"
            min={2}
            max={72}
            defaultValue={str(get(value, ["offline_reservation_hours"]) ?? 24)}
          />
          <Field
            name="transferDiscount"
            label="Descuento por transferencia (%)"
            type="number"
            min={0}
            max={30}
            step={1}
            inputMode="numeric"
            defaultValue={str(get(value, ["transfer", "discount_percent"]) ?? 0)}
          />
        </div>
        <p>
          El descuento arranca en 0 %. La Ley 25.065 (art. 37, inciso c) pide el mismo precio al contado y con tarjeta en
          un pago: hablalo con tu contador antes de subirlo. Si lo activás, la compra muestra el total con descuento al
          elegir transferencia.
        </p>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Pago al retirar</legend>
        <p>Solo con retiro en el local. La reserva usa las mismas horas que la transferencia.</p>
        <Toggle
          name="pickupPaymentEnabled"
          label="Ofrecer pago al retirar"
          defaultChecked={bool(get(value, ["pickup_payment", "enabled"]))}
        />
        <div className={styles.fields}>
          <Field
            name="pickupPaymentMax"
            label="Monto máximo del pedido (vacío: sin tope)"
            inputMode="numeric"
            defaultValue={str(get(value, ["pickup_payment", "max_amount"]))}
          />
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Sistema de gestión</legend>
        <Toggle
          name="syncGestionSales"
          label="Registrar cada pedido cobrado como venta en la gestión"
          defaultChecked={get(value, ["sync_gestion_sales"]) !== false}
        />
      </fieldset>

      <Footer state={state} label="Guardar cobros" />
    </form>
  );
}

type Zone = { name: string; price: string; detail: string };

export function DeliverySettingsForm({ value }: { value: unknown }) {
  const [state, action] = useActionState(saveDeliverySettingsAction, {});
  const saved = (get(value, ["local", "zones"]) as Json[] | undefined) ?? [];
  const [zones, setZones] = useState<Zone[]>(() => {
    const rows = saved.map((zone) => ({ name: str(zone.name), price: str(zone.price), detail: str(zone.detail) }));
    return rows.length ? rows : [{ name: "", price: "", detail: "" }];
  });
  return (
    <form action={action} className={styles.form}>
      <h2>Entregas</h2>
      <p>El retiro en el local está siempre disponible salvo que lo apagues. Las demás opciones aparecen cuando las activás.</p>

      <fieldset className={styles.group}>
        <legend>Retiro en el local</legend>
        <Toggle name="pickupEnabled" label="Ofrecer retiro en Independencia 784" defaultChecked={get(value, ["pickup", "enabled"]) !== false} />
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Entrega CheTech</legend>
        <p>Una fila por zona. El cliente elige la zona y paga ese precio.</p>
        <Toggle name="localEnabled" label="Ofrecer entrega CheTech" defaultChecked={bool(get(value, ["local", "enabled"]))} />
        <div className={styles.zones}>
          {zones.map((zone, index) => (
            <div className={styles.zone} key={index}>
              <label>
                Zona
                <input name="zoneName" defaultValue={zone.name} maxLength={60} placeholder="Centro" />
              </label>
              <label>
                Precio
                <input name="zonePrice" defaultValue={zone.price} inputMode="numeric" placeholder="3000" />
              </label>
              <label>
                Barrios o detalle
                <input name="zoneDetail" defaultValue={zone.detail} maxLength={160} placeholder="Centro, Nueva Córdoba, Güemes" />
              </label>
            </div>
          ))}
        </div>
        {zones.length < 20 ? (
          <button
            type="button"
            className="btn"
            data-variant="quiet"
            onClick={() => setZones((current) => [...current, { name: "", price: "", detail: "" }])}
          >
            Agregar otra zona
          </button>
        ) : null}
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Correo Argentino</legend>
        <p>Tarifa fija según el paquete más grande del pedido. Los productos marcados como “no viaja” no se ofrecen por correo.</p>
        <Toggle name="correoEnabled" label="Ofrecer envío por correo" defaultChecked={bool(get(value, ["correo", "enabled"]))} />
        <div className={styles.fields}>
          <Field name="rateChico" label="Paquete chico" inputMode="numeric" defaultValue={str(get(value, ["correo", "rates", "chico"]))} />
          <Field name="rateMediano" label="Paquete mediano" inputMode="numeric" defaultValue={str(get(value, ["correo", "rates", "mediano"]))} />
          <Field name="rateGrande" label="Paquete grande" inputMode="numeric" defaultValue={str(get(value, ["correo", "rates", "grande"]))} />
        </div>
      </fieldset>

      <Footer state={state} label="Guardar entregas" />
    </form>
  );
}

export function PromoSettingsForm({ value }: { value: unknown }) {
  const [state, action] = useActionState(savePromoSettingsAction, {});
  const channels = (get(value, ["tv_channels"]) as unknown[] | undefined) ?? [];
  return (
    <form action={action} className={styles.form}>
      <h2>Portada</h2>
      <p>Si dejás los canales vacíos, el televisor muestra los productos más vendidos con foto.</p>
      <div className={styles.fields}>
        <label>
          Canales del televisor (hasta 5, uno por línea)
          <textarea
            name="tvChannels"
            rows={5}
            defaultValue={channels.map(String).join("\n")}
            placeholder={"onn-4k-pro\ncontrol-remoto-universal"}
          />
        </label>
        <Field
          name="reelProductSlug"
          label="Producto del video de la semana (opcional)"
          maxLength={160}
          defaultValue={str(get(value, ["reel_product_slug"]))}
        />
        <Field name="reelTitle" label="Título del video" maxLength={120} defaultValue={str(get(value, ["reel_title"]))} />
      </div>
      <Footer state={state} label="Guardar portada" />
    </form>
  );
}
