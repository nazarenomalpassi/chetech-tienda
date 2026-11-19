"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { attributionFromLocation, saveAttribution } from "@/lib/attribution";

const SESSION_KEY = "chetech-visita-contada";

// Cuenta una visita por sesión, agrupada por origen. No guarda datos personales ni usa cookies.
export function VisitTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const touch = attributionFromLocation(window.location.href, document.referrer);
    if (touch) saveAttribution(touch);
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      return;
    }
    const body = JSON.stringify(
      touch ?? { source: "directo", medium: "-", campaign: "-", content: "-", landing: window.location.pathname },
    );
    if (navigator.sendBeacon) navigator.sendBeacon("/api/visit", new Blob([body], { type: "application/json" }));
    else fetch("/api/visit", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => undefined);
    // Solo la primera carga de la sesión: los cambios de página no cuentan como visitas nuevas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const touch = attributionFromLocation(window.location.href, "");
    if (touch) saveAttribution(touch);
  }, [pathname, searchParams]);

  return null;
}
