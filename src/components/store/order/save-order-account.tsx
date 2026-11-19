"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createAccountFromOrderAction } from "@/app/pedido/[numero]/account-actions";
import styles from "./save-order-account.module.css";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" data-variant="secondary" disabled={pending} aria-busy={pending}>
      {pending ? "Creando la cuenta…" : "Crear mi cuenta"}
    </button>
  );
}

/** Comprobante de un pedido sin cuenta: con una contraseña, los datos de la compra quedan guardados. */
export function SaveOrderAccount({ orderNumber, token, email }: { orderNumber: string; token: string; email: string }) {
  const [state, action] = useActionState(createAccountFromOrderAction, {});

  if (state.message) {
    return (
      <section className={styles.panel} aria-labelledby="cuenta-titulo">
        <h2 id="cuenta-titulo">Revisá tu mail</h2>
        <p role="status">{state.message}</p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="cuenta-titulo">
      <h2 id="cuenta-titulo">Guardá este pedido en tu cuenta</h2>
      <p>
        Ya tenemos tus datos: elegí una contraseña y la próxima compra no los vuelve a pedir. La cuenta queda a nombre de{" "}
        <strong>{email}</strong>.
      </p>
      <form action={action} className={styles.form}>
        <input type="hidden" name="orderNumber" value={orderNumber} />
        <input type="hidden" name="token" value={token} />
        <label className="field">
          <span>Contraseña nueva</span>
          <input
            type="password"
            name="password"
            minLength={10}
            maxLength={72}
            required
            autoComplete="new-password"
            aria-describedby="cuenta-ayuda"
          />
          <small id="cuenta-ayuda">Al menos 10 caracteres, con letras y números.</small>
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="termsAccepted" required />
          <span>
            Acepto los{" "}
            <Link href="/terminos-y-condiciones" className="enlace" target="_blank">
              términos
            </Link>{" "}
            y la{" "}
            <Link href="/privacidad" className="enlace" target="_blank">
              política de privacidad
            </Link>
            .
          </span>
        </label>
        {state.error ? (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        ) : null}
        <Submit />
      </form>
    </section>
  );
}
