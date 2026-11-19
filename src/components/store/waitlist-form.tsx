"use client";

import { useState } from "react";
import styles from "./waitlist-form.module.css";

type Props = {
  kind: "product" | "refurbished" | "board";
  productId?: string;
  query?: string;
  cta: string;
};

// Lista de aviso: deja un WhatsApp o un mail y te avisamos cuando entra.
export function WaitlistForm({ kind, productId, query, cta }: Props) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("sending");
    setMessage("");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          storefront_product_id: productId,
          query: query ?? form.get("query"),
          name: form.get("name"),
          contact: form.get("contact"),
          consent: form.get("consent") === "on",
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No pudimos guardar tus datos. Probá de nuevo.");
      setState("done");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "No pudimos guardar tus datos. Probá de nuevo.");
    }
  };

  if (state === "done") {
    return (
      <p className={styles.done} role="status">
        Listo. Te avisamos apenas entre.
      </p>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.row}>
        <label className="field">
          <span>Tu nombre</span>
          <input name="name" autoComplete="given-name" maxLength={120} />
        </label>
        <label className="field">
          <span>WhatsApp o mail</span>
          <input name="contact" required autoComplete="tel" maxLength={120} placeholder="3571 15 123456" />
        </label>
      </div>
      <label className={styles.consent}>
        <input type="checkbox" name="consent" required />
        <span>Acepto que me escriban solo para avisarme de este ingreso.</span>
      </label>
      <button type="submit" className="btn" disabled={state === "sending"}>
        {state === "sending" ? "Guardando…" : cta}
      </button>
      {message ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
