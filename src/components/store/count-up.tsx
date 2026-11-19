"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { isHydrated } from "@/lib/hydration";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// La primera carga llega con el número ya escrito desde el servidor: ahí no se anima, para que no
// parpadee. En las navegaciones siguientes dentro del sitio, el número rueda desde el valor anterior.
const lastValues = new Map<string, number>();

type Props = { value: number; /** Los contadores con el mismo nombre ruedan desde el último valor mostrado. */ name?: string };

export function CountUp({ value, name }: Props) {
  const node = useRef<HTMLSpanElement>(null);

  useIsomorphicLayoutEffect(() => {
    const element = node.current;
    const from = name ? (lastValues.get(name) ?? 0) : 0;
    if (name) lastValues.set(name, value);
    if (!element || !isHydrated() || from === value) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const start = performance.now();
    const duration = 650;
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = String(Math.round(from + (value - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    element.textContent = String(from);
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      element.textContent = String(value);
    };
  }, [value, name]);

  return <span ref={node}>{value}</span>;
}
