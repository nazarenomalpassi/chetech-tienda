"use client";

import { useEffect, useRef } from "react";

type Props = {
  children: React.ReactNode;
  /** Cambia cuando cambia el contenido sin cambiar de página (otro producto, otro filtro): se vuelve a armar. */
  signature?: string;
  className?: string;
};

// E13 · Las páginas se arman al scrollear. Lo que se marca con data-anim entra cuando llega a la
// pantalla: "titulo" sube renglón por renglón desde atrás de una máscara, "grupo" hace entrar a sus
// hijos en cascada, "bloque" sube entero, data-count cuenta hasta su número y "marquesina" acelera con
// el scroll. Solo se anima lo que todavía no se vio: lo que ya está en pantalla al cargar queda quieto,
// así nada parpadea. Con "reducir movimiento" no corre nada de esto y la página se lee igual.
//
// Este componente es solo la envoltura: el motor (GSAP, en scroll-motion-engine.ts) se descarga cuando
// el navegador queda libre, después de que la página ya se ve. Como lo que anima está fuera de la
// pantalla, llegar un instante más tarde no se nota y la carga inicial pesa menos.
export function ScrollMotion({ children, signature, className }: Props) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    // Quien pidió menos movimiento no descarga el motor: no tendría nada que hacer.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let undo: (() => void) | undefined;
    const load = () => {
      void import("./scroll-motion-engine").then(({ mountScrollMotion }) => {
        if (!cancelled) undo = mountScrollMotion(element);
      });
    };

    const idle = typeof window.requestIdleCallback === "function";
    const handle = idle
      ? window.requestIdleCallback(load, { timeout: 1200 })
      : window.setTimeout(load, 250);

    return () => {
      cancelled = true;
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      undo?.();
    };
  }, [signature]);

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
