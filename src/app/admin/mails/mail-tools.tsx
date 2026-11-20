"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { sendTestMailAction, type TestMailState } from "./actions";
import styles from "./mails.module.css";

function SendButton({ label, variant }: { label: string; variant?: "secondary" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" data-variant={variant} disabled={pending}>
      {pending ? "Mandando…" : label}
    </button>
  );
}

/** Botón que manda una prueba (de un mail o de todos) a tu propio mail y dice cómo salió. */
export function TestMailForm({
  id,
  label,
  variant,
}: {
  id: string;
  label: string;
  variant?: "secondary";
}) {
  const [state, action] = useActionState<TestMailState, FormData>(sendTestMailAction, {});
  return (
    <form action={action} className={styles.testForm}>
      <input type="hidden" name="id" value={id} />
      <SendButton label={label} variant={variant} />
      <p className={styles.status} role="status" data-kind={state.error ? "error" : "ok"}>
        {state.error ?? state.message ?? ""}
      </p>
    </form>
  );
}

const widths = [
  { key: "celular", label: "Celular", width: 390 },
  { key: "compu", label: "Compu", width: 680 },
] as const;

/**
 * El mail tal como lo arma la tienda, dentro de un marco sin scripts. El alto se ajusta al contenido
 * y los enlaces se abren en otra pestaña (dentro del marco no cargarían).
 */
export function MailFrame({ html, title }: { html: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(900);
  const [view, setView] = useState<(typeof widths)[number]["key"]>("compu");
  const doc = html.replace(/<head>/i, '<head><base target="_blank">');

  const measure = useCallback(() => {
    // Se espera un cuadro para que el mail termine de acomodarse al ancho nuevo.
    requestAnimationFrame(() => {
      const body = frame.current?.contentDocument?.body;
      if (body) setHeight(Math.max(300, body.scrollHeight));
    });
  }, []);

  useEffect(() => {
    measure();
  }, [view, measure]);

  return (
    <div className={styles.preview}>
      <div className={styles.switch} role="group" aria-label="Ancho de la vista previa">
        {widths.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={view === item.key}
            onClick={() => setView(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className={styles.stage}>
        <iframe
          ref={frame}
          title={title}
          srcDoc={doc}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          onLoad={measure}
          style={{ width: widths.find((item) => item.key === view)?.width, height }}
        />
      </div>
    </div>
  );
}
