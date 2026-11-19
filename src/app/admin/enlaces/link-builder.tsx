"use client";

import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { buildTrackedUrl, linkPresets } from "@/lib/tracked-links";
import styles from "./links.module.css";

type Destination = { label: string; path: string };

export function LinkBuilder({ baseUrl, destinations }: { baseUrl: string; destinations: Destination[] }) {
  const [presetKey, setPresetKey] = useState(linkPresets[0].key);
  const [destination, setDestination] = useState(destinations[0]?.path ?? "/");
  const [customPath, setCustomPath] = useState("");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<{ png: string; svg: string } | null>(null);

  const preset = linkPresets.find((item) => item.key === presetKey) ?? linkPresets[0];
  const url = useMemo(
    () =>
      buildTrackedUrl({
        baseUrl,
        path: destination === "__otro" ? customPath : destination,
        source: preset.source,
        medium: preset.medium,
        campaign,
        content,
      }),
    [baseUrl, destination, customPath, preset, campaign, content],
  );

  useEffect(() => {
    let cancelled = false;
    if (!url) return;
    const options = { margin: 2, errorCorrectionLevel: "M" as const, color: { dark: "#101010", light: "#ffffff" } };
    Promise.all([QRCode.toDataURL(url, { ...options, width: 1200 }), QRCode.toString(url, { ...options, type: "svg" })])
      .then(([png, svg]) => {
        if (!cancelled) setQr({ png, svg: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const fileName = `chetech-qr-${preset.key}${campaign ? `-${campaign.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""}`;

  return (
    <div className={styles.layout}>
      <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
        <fieldset className={styles.presets}>
          <legend>Dónde lo vas a poner</legend>
          {linkPresets.map((item) => (
            <label key={item.key} className={styles.preset} data-active={item.key === presetKey}>
              <input type="radio" name="preset" value={item.key} checked={item.key === presetKey} onChange={() => setPresetKey(item.key)} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <label className={styles.field}>
          A dónde lleva
          <select value={destination} onChange={(event) => setDestination(event.target.value)}>
            {destinations.map((item) => (
              <option key={item.path} value={item.path}>
                {item.label}
              </option>
            ))}
            <option value="__otro">Otra página de la tienda</option>
          </select>
        </label>
        {destination === "__otro" ? (
          <label className={styles.field}>
            Pegá el enlace de la página
            <input value={customPath} onChange={(event) => setCustomPath(event.target.value)} placeholder={`${baseUrl}/productos/…`} inputMode="url" />
          </label>
        ) : null}
        <label className={styles.field}>
          Campaña (opcional)
          <input value={campaign} onChange={(event) => setCampaign(event.target.value)} maxLength={60} placeholder="Ej.: onn-4k o dia-del-padre" />
        </label>
        <label className={styles.field}>
          Pieza (opcional)
          <input value={content} onChange={(event) => setContent(event.target.value)} maxLength={60} placeholder="Ej.: reel-12-nov" />
        </label>
      </form>

      <section className={styles.result} aria-live="polite">
        <h2>Tu enlace</h2>
        {url ? (
          <>
            <p className={styles.url}>{url}</p>
            <div className={styles.actions}>
              <button type="button" className="btn" onClick={copy}>
                {copied ? "Copiado" : "Copiar enlace"}
              </button>
            </div>
            {qr ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- imagen generada en el navegador */}
                <img className={styles.qr} src={qr.png} alt={`Código QR de ${preset.label}`} width={240} height={240} />
                <div className={styles.actions}>
                  <a className="btn" data-variant="secondary" href={qr.png} download={`${fileName}.png`}>
                    Descargar QR (PNG)
                  </a>
                  <a className="btn" data-variant="quiet" href={qr.svg} download={`${fileName}.svg`}>
                    Para imprenta (SVG)
                  </a>
                </div>
                <p className={styles.note}>
                  {preset.qr
                    ? "Imprimilo de 4 cm de lado o más, con margen blanco alrededor."
                    : "El QR sirve si querés mostrar este enlace en un cartel o en pantalla."}
                </p>
              </>
            ) : null}
          </>
        ) : (
          <p className={styles.error} role="alert">
            Ese enlace no es de la tienda. Pegá una página de {baseUrl.replace(/^https?:\/\//, "")}.
          </p>
        )}
      </section>
    </div>
  );
}
