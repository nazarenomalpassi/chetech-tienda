"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * Teclado en un diálogo (menú, buscador, carrito). Mientras está abierto, Tab da la vuelta adentro en
 * vez de irse a la página que quedó atrás; al cerrarlo, el foco vuelve a donde estaba (el botón que lo
 * abrió). Dónde arranca el foco lo decide cada diálogo.
 */
export function useDialogFocus(container: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const root = container.current;
      if (!root) return;
      // Solo lo que se alcanza con Tab y se ve (un fondo para cerrar con tabindex -1 no cuenta).
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (item) => item.tabIndex >= 0 && item.getClientRects().length > 0,
      );
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!root.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Si el botón que abrió el diálogo sigue en la página, el foco vuelve a él.
      if (previous && previous !== document.body && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [container, open]);
}
