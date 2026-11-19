"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import styles from "./analytics.module.css";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const KEY = "chetech-cookies-v1";

type Choice = "accepted" | "rejected" | null;

// Aviso de cookies con Aceptar y Rechazar. Sin aceptar no se carga ninguna medición publicitaria.
// Si no hay identificadores de Google o Meta configurados, no aparece nada.
export function Analytics() {
  const [choice, setChoice] = useState<Choice>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setChoice((localStorage.getItem(KEY) as Choice) ?? null);
    } catch {
      setChoice(null);
    }
    setReady(true);
  }, []);

  if (!GA_ID && !PIXEL_ID) return null;

  const decide = (value: Exclude<Choice, null>) => {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // Sin almacenamiento la decisión vale solo para esta visita.
    }
    setChoice(value);
  };

  return (
    <>
      {choice === "accepted" && GA_ID ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}',{anonymize_ip:true});`}
          </Script>
        </>
      ) : null}
      {choice === "accepted" && PIXEL_ID ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');fbq('track','PageView');`}
        </Script>
      ) : null}
      {ready && choice === null ? (
        <div className={styles.banner} role="region" aria-label="Cookies">
          <p>
            Usamos cookies para medir qué productos y publicaciones funcionan. Podés aceptarlas o rechazarlas.{" "}
            <Link href="/cookies" className="enlace">
              Más información
            </Link>
          </p>
          <div className={styles.actions}>
            <button type="button" className="btn" data-variant="quiet" onClick={() => decide("rejected")}>
              Rechazar
            </button>
            <button type="button" className="btn" onClick={() => decide("accepted")}>
              Aceptar
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
