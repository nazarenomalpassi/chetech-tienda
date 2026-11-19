"use client";

import { REVIEW_COOKIES_EVENT } from "@/components/store/analytics";

/** Vuelve a mostrar el aviso de cookies para aceptar o rechazar de nuevo. */
export function CookieChoiceButton() {
  return (
    <button type="button" className="btn" data-variant="secondary" onClick={() => window.dispatchEvent(new Event(REVIEW_COOKIES_EVENT))}>
      Cambiar mi elección de cookies
    </button>
  );
}
