"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type RequestKind = "withdrawal" | "privacy";
type SubmitState = {
  status: "idle" | "sending" | "success" | "error";
  reference?: string;
  message?: string;
};

export function LegalRequestForm({ kind }: { kind: RequestKind }) {
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const isWithdrawal = kind === "withdrawal";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setState({ status: "sending" });
    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/legal-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, requestType: kind }),
      });
      const result = (await response.json()) as { reference?: string; message?: string };
      if (!response.ok || !result.reference)
        throw new Error(result.message || "No pudimos registrar la solicitud.");
      formElement.reset();
      setState({ status: "success", reference: result.reference });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "No pudimos registrar la solicitud.",
      });
    }
  }

  if (state.status === "success")
    return (
      <div className="request-confirmation" role="status">
        <p className="eyebrow">Solicitud recibida</p>
        <h2>Tu constancia es {state.reference}</h2>
        <p>
          Guardá este número. La solicitud quedó registrada con fecha y hora y será revisada por
          Chetech.
        </p>
        <Link className="button primary" href="/">
          Volver al inicio
        </Link>
      </div>
    );

  return (
    <form className="legal-request-form" onSubmit={submit} noValidate>
      <div className="form-row">
        <label>
          Nombre
          <input name="firstName" required maxLength={80} autoComplete="given-name" />
        </label>
        <label>
          Apellido
          <input name="lastName" required maxLength={80} autoComplete="family-name" />
        </label>
      </div>
      <label>
        Correo electrónico o teléfono
        <input
          name="contact"
          required
          maxLength={160}
          autoComplete="email"
          aria-describedby="contact-help"
        />
      </label>
      <small id="contact-help">
        Usaremos este dato solamente para identificar y responder esta solicitud.
      </small>
      <label>
        Canal de respuesta preferido
        <select name="preferredChannel" required defaultValue="email">
          <option value="email">Correo electrónico</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="phone">Teléfono</option>
        </select>
      </label>
      {isWithdrawal ? (
        <>
          <div className="form-row">
            <label>
              Número de pedido o referencia (si existe)
              <input name="orderReference" maxLength={80} />
            </label>
            <label>
              Fecha aproximada
              <input name="approximateDate" type="date" />
            </label>
          </div>
          <label>
            Producto
            <input name="product" required maxLength={200} />
          </label>
          <label>
            Motivo (opcional)
            <textarea name="reason" rows={4} maxLength={1000} />
          </label>
        </>
      ) : (
        <>
          <label>
            Tipo de solicitud
            <select name="privacyRight" required defaultValue="access">
              <option value="access">Acceso a mis datos</option>
              <option value="rectification">Rectificación o actualización</option>
              <option value="deletion">Supresión</option>
              <option value="information">Información sobre el uso</option>
              <option value="consent">Retiro de consentimiento</option>
            </select>
          </label>
          <label>
            Detalle necesario para ubicar la información
            <textarea name="reason" rows={4} maxLength={1000} required />
          </label>
          <p className="form-help">
            No adjuntes DNI ni documentos sensibles. Si fuera necesaria una verificación adicional,
            la coordinaremos de manera razonable.
          </p>
        </>
      )}
      <label className="honeypot" aria-hidden="true">
        Sitio web
        <input name="website" tabIndex={-1} autoComplete="off" maxLength={0} />
      </label>
      <p className="form-privacy">
        Al enviar, los datos se utilizarán para gestionar esta solicitud. Consultá la{" "}
        <Link href="/privacidad">Política de privacidad</Link>.
      </p>
      <button className="button primary" type="submit" disabled={state.status === "sending"}>
        {state.status === "sending" ? "Registrando…" : "Enviar solicitud"}
      </button>
      <div className="form-status" aria-live="polite">
        {state.status === "error" && (
          <p>{state.message} Si el problema continúa, escribinos por los canales de contacto.</p>
        )}
      </div>
    </form>
  );
}
