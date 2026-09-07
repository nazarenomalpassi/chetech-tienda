"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { AccountActionState } from "@/app/account-actions";
import { saveAddressAction, updateProfileAction } from "@/app/account-actions";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button className="button primary" disabled={pending}>
      {pending ? "Guardando…" : children}
    </button>
  );
}

function Feedback({ state }: { state: AccountActionState }) {
  return (
    <>
      {state.error && (
        <p className="form-message error" role="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="form-message success" role="status">
          {state.message}
        </p>
      )}
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
    <form className="account-form" action={action}>
      <div className="account-form-grid">
        <label>
          Nombre
          <input
            name="firstName"
            defaultValue={profile.firstName}
            maxLength={80}
            autoComplete="given-name"
            required
          />
        </label>
        <label>
          Apellido
          <input
            name="lastName"
            defaultValue={profile.lastName}
            maxLength={80}
            autoComplete="family-name"
            required
          />
        </label>
        <label>
          Correo electrónico
          <input value={profile.email} readOnly aria-readonly="true" />
        </label>
        <label>
          Teléfono
          <input name="phone" defaultValue={profile.phone} maxLength={40} autoComplete="tel" />
        </label>
      </div>
      <label className="check-row">
        <input type="checkbox" name="marketingConsent" defaultChecked={profile.marketingConsent} />
        <span>
          Quiero recibir novedades comerciales. Puedo retirar este consentimiento cuando quiera.
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
  compact = false,
}: {
  address?: AddressRecord;
  compact?: boolean;
}) {
  const [state, action] = useActionState(saveAddressAction, {});
  return (
    <form className={`account-form address-form${compact ? " compact" : ""}`} action={action}>
      {address.id && <input type="hidden" name="id" value={address.id} />}
      <div className="account-form-grid">
        <label>
          Etiqueta
          <input name="label" defaultValue={address.label ?? "Casa"} maxLength={40} required />
        </label>
        <label>
          Persona que recibe
          <input
            name="recipientName"
            defaultValue={address.recipient_name ?? ""}
            maxLength={160}
            autoComplete="name"
            required
          />
        </label>
        <label>
          Teléfono
          <input
            name="phone"
            defaultValue={address.phone ?? ""}
            maxLength={40}
            autoComplete="tel"
            required
          />
        </label>
        <label>
          Calle
          <input
            name="street"
            defaultValue={address.street ?? ""}
            maxLength={160}
            autoComplete="address-line1"
            required
          />
        </label>
        <label>
          Número
          <input
            name="streetNumber"
            defaultValue={address.street_number ?? ""}
            maxLength={30}
            required
          />
        </label>
        <label>
          Piso
          <input name="floor" defaultValue={address.floor ?? ""} maxLength={30} />
        </label>
        <label>
          Departamento
          <input name="apartment" defaultValue={address.apartment ?? ""} maxLength={30} />
        </label>
        <label>
          Ciudad
          <input
            name="city"
            defaultValue={address.city ?? "Río Tercero"}
            maxLength={100}
            autoComplete="address-level2"
            required
          />
        </label>
        <label>
          Provincia
          <input
            name="province"
            defaultValue={address.province ?? "Córdoba"}
            maxLength={100}
            autoComplete="address-level1"
            required
          />
        </label>
        <label>
          Código postal
          <input
            name="postalCode"
            defaultValue={address.postal_code ?? ""}
            maxLength={20}
            autoComplete="postal-code"
            required
          />
        </label>
      </div>
      <label>
        Información adicional
        <textarea
          name="additionalInfo"
          defaultValue={address.additional_info ?? ""}
          maxLength={500}
          rows={3}
        />
      </label>
      <label className="check-row">
        <input type="checkbox" name="isDefault" defaultChecked={address.is_default} />
        <span>Usar como dirección predeterminada</span>
      </label>
      <Feedback state={state} />
      <Submit>{address.id ? "Actualizar dirección" : "Guardar dirección"}</Submit>
    </form>
  );
}
