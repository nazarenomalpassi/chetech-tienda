"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { AccountActionState } from "@/app/account-actions";
import { saveAddressAction, updateProfileAction } from "@/app/account-actions";
import styles from "@/app/cuenta/account.module.css";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" disabled={pending} aria-busy={pending}>
      {pending ? "Guardando…" : children}
    </button>
  );
}

function Feedback({ state }: { state: AccountActionState }) {
  return (
    <>
      {state.error ? (
        <p className="aviso" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="aviso" data-tipo="ok" role="status">
          {state.message}
        </p>
      ) : null}
    </>
  );
}

export function ProfileForm({
  profile,
}: {
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    marketingConsent: boolean;
  };
}) {
  const [state, action] = useActionState(updateProfileAction, {});
  return (
    <form className={styles.form} action={action}>
      <div className={styles.grid}>
        <label className="field">
          <span>Nombre</span>
          <input
            name="firstName"
            defaultValue={profile.firstName}
            maxLength={80}
            autoComplete="given-name"
            required
          />
        </label>
        <label className="field">
          <span>Apellido</span>
          <input
            name="lastName"
            defaultValue={profile.lastName}
            maxLength={80}
            autoComplete="family-name"
            required
          />
        </label>
        <label className="field">
          <span>Mail</span>
          <input value={profile.email} readOnly aria-readonly="true" aria-describedby="mail-fijo" />
          <small id="mail-fijo">Para cambiarlo, escribinos.</small>
        </label>
        <label className="field">
          <span>Teléfono</span>
          <input name="phone" defaultValue={profile.phone} maxLength={40} autoComplete="tel" />
        </label>
      </div>
      <label className={styles.check}>
        <input type="checkbox" name="marketingConsent" defaultChecked={profile.marketingConsent} />
        <span>
          Quiero recibir ofertas por mail o WhatsApp. Me puedo dar de baja cuando quiera.
        </span>
      </label>
      <Feedback state={state} />
      <Submit>Guardar cambios</Submit>
    </form>
  );
}

export type AddressRecord = {
  id?: string;
  label?: string;
  recipient_name?: string;
  phone?: string;
  street?: string;
  street_number?: string;
  floor?: string | null;
  apartment?: string | null;
  city?: string;
  province?: string;
  postal_code?: string;
  additional_info?: string | null;
  is_default?: boolean;
};

export function AddressForm({
  address = {},
}: {
  address?: AddressRecord;
}) {
  const [state, action] = useActionState(saveAddressAction, {});
  return (
    <form className={styles.form} action={action}>
      {address.id && <input type="hidden" name="id" value={address.id} />}
      <div className={styles.grid}>
        <label className="field">
          <span>Etiqueta</span>
          <input name="label" defaultValue={address.label ?? "Casa"} maxLength={40} required />
        </label>
        <label className="field">
          <span>Persona que recibe</span>
          <input
            name="recipientName"
            defaultValue={address.recipient_name ?? ""}
            maxLength={160}
            autoComplete="name"
            required
          />
        </label>
        <label className="field">
          <span>Teléfono</span>
          <input
            name="phone"
            defaultValue={address.phone ?? ""}
            maxLength={40}
            autoComplete="tel"
            required
          />
        </label>
        <label className="field">
          <span>Calle</span>
          <input
            name="street"
            defaultValue={address.street ?? ""}
            maxLength={160}
            autoComplete="address-line1"
            required
          />
        </label>
        <label className="field">
          <span>Número</span>
          <input
            name="streetNumber"
            defaultValue={address.street_number ?? ""}
            maxLength={30}
            required
          />
        </label>
        <label className="field">
          <span>Piso</span>
          <input name="floor" defaultValue={address.floor ?? ""} maxLength={30} />
        </label>
        <label className="field">
          <span>Departamento</span>
          <input name="apartment" defaultValue={address.apartment ?? ""} maxLength={30} />
        </label>
        <label className="field">
          <span>Ciudad</span>
          <input
            name="city"
            defaultValue={address.city ?? "Río Tercero"}
            maxLength={100}
            autoComplete="address-level2"
            required
          />
        </label>
        <label className="field">
          <span>Provincia</span>
          <input
            name="province"
            defaultValue={address.province ?? "Córdoba"}
            maxLength={100}
            autoComplete="address-level1"
            required
          />
        </label>
        <label className="field">
          <span>Código postal</span>
          <input
            name="postalCode"
            defaultValue={address.postal_code ?? ""}
            maxLength={20}
            autoComplete="postal-code"
            required
          />
        </label>
      </div>
      <label className="field">
        <span>Indicaciones para la entrega (opcional)</span>
        <textarea
          name="additionalInfo"
          defaultValue={address.additional_info ?? ""}
          maxLength={500}
          rows={3}
        />
      </label>
      <label className={styles.check}>
        <input type="checkbox" name="isDefault" defaultChecked={address.is_default} />
        <span>Usar esta dirección por defecto</span>
      </label>
      <Feedback state={state} />
      <Submit>{address.id ? "Actualizar dirección" : "Guardar dirección"}</Submit>
    </form>
  );
}
