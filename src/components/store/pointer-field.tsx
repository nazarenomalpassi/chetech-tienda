"use client";

import { useEffect, useRef } from "react";
import { clearPointerVars, writePointerVars } from "@/lib/pointer-vars";

// Zona que sigue al cursor (solo con mouse). Lo que adentro lleva data-cursor recibe la posición del
// cursor como variables CSS (--mx, --my, --px, --py) mientras está debajo; el efecto lo decide cada
// estilo: una luz que acompaña, una inclinación, fotos que se corren.
export function PointerField({ children, className }: { children: React.ReactNode; className?: string }) {
  const frame = useRef(0);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <div
      className={className}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse") return;
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-cursor]");
        if (current.current && current.current !== target) clearPointerVars(current.current, frame);
        current.current = target;
        writePointerVars(event, target, frame);
      }}
      onPointerLeave={() => {
        clearPointerVars(current.current, frame);
        current.current = null;
      }}
    >
      {children}
    </div>
  );
}
