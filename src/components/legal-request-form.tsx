"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import styles from "./legal.module.css";

type RequestKind = "withdrawal" | "privacy";
type SubmitState = {
  status: "idle" | "sending" | "success" | "error";
  reference?: string;
  message?: string;
};

export function LegalRequestForm({ kind, orderReference = "" }: { kind: RequestKind; orderReference?: string }) {
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
      <div className={styles.done} role="status">
        <h2>Tu constancia es {state.reference}</h2>
        <p>
          Guardá este número. La solicitud quedó registrada con fecha y hora, y te respondemos por el canal que
          elegiste.
        </p>
        <Link className="btn" href="/">
          Volver al inicio
        </Link>
      </div>
    );

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className="barras" aria-hidden />
      <div className={styles.row}>
        <label className="field">
          <span>Nombre</span>
          <input name="firstName" required maxLength={80} autoComplete="given-name" />
        </label>
        <label className="field">
          <span>Apellido</span>
          <input name="lastName" required maxLength={80} autoComplete="family-name" />
        </label>
      </div>
      <label className="field">
        <span>Mail o teléfono</span>
        <input name="contact" required maxLength={160} autoComplete="email" aria-describedby="contact-help" />
        <small id="contact-help">Lo usamos solo para identificar y responder esta solicitud.</small>
      </label>
      <label className="field">
        <span>¿Por dónde te respondemos?</span>
        <select name="preferredChannel" required defaultValue="email">
          <option value="email">Mail</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="phone">Llamada</option>
        </select>
      </label>
      {isWithdrawal ? (
        <>
          <div className={styles.row}>
            <label className="field">
              <span>Número de pedido (si lo tenés)</span>
              <input name="orderReference" maxLength={80} defaultValue={orderReference} placeholder="CHT-000123" />
            </label>
            <label className="field">
              <span>Fecha aproximada de la compra</span>
              <input name="approximateDate" type="date" />
            </label>
          </div>
          <label className="field">
            <span>Producto</span>
            <input name="product" required maxLength={200} />
          </label>
          <label className="field">
            <span>Motivo (opcional)</span>
            <textarea name="reason" rows={4} maxLength={1000} />
          </label>
        </>
      ) : (
        <>
          <label className="field">
            <span>Qué necesitás</span>
            <select name="privacyRight" required defaultValue="access">
              <option value="access">Ver mis datos</option>
              <option value="rectification">Corregir o actualizar mis datos</option>
              <option value="deletion">Borrar mis datos</option>
              <option value="information">Saber cómo se usan</option>
              <option value="consent">Retirar mi consentimiento</option>
            </select>
          </label>
          <label className="field">
            <span>Detalle para ubicar tus datos</span>
            <textarea name="reason" rows={4} maxLength={1000} required />
            <small>No adjuntes el DNI ni documentos. Si hace falta verificar tu identidad, te lo pedimos aparte.</small>
          </label>
        </>
      )}
      <label className={styles.honeypot} aria-hidden="true">
        Sitio web
        <input name="website" tabIndex={-1} autoComplete="off" maxLength={0} />
      </label>
      <p className={styles.small}>
        Usamos estos datos solo para esta solicitud. Más detalles en la{" "}
        <Link href="/privacidad" className="enlace">
          política de privacidad
        </Link>
        .
      </p>
      {state.status === "error" ? (
        <p className="aviso" role="alert">
          {state.message} Si sigue fallando, escribinos por mail o WhatsApp.
        </p>
      ) : null}
      <button className="btn" data-size="large" data-block="true" type="submit" disabled={state.status === "sending"} aria-busy={state.status === "sending"}>
        {state.status === "sending" ? "Enviando…" : "Enviar solicitud"}
      </button>
    </form>
  );
}
