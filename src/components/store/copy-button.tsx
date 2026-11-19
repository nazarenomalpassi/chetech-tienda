"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  /** Qué se copia, para el lector de pantalla: "el número", "el mail". */ what: string;
  className?: string;
};

// Botón chico para copiar un dato (teléfono, mail). Confirma un momento con una tilde.
export function CopyButton({ value, what, className }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Sin permiso para el portapapeles: no se confirma nada que no pasó.
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      className={className}
      onClick={copy}
      data-copied={copied}
      aria-label={`Copiar ${what}`}
    >
      {copied ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}
      <span aria-live="polite">{copied ? "Copiado" : "Copiar"}</span>
    </button>
  );
}
