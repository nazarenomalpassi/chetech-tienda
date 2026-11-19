import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { siteConfig } from "@/config/site";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";

// Imagen que se ve al pegar un enlace en WhatsApp o Instagram: foto, nombre y precio, con la letra y los
// grises de la marca. Se arma en el servidor y queda en caché.

export const shareImageSize = { width: 1200, height: 630 };

const tinta = "#101010";
const papel = "#f8f8f8";
const acero = "#8a9090";

const asset = (path: string) => join(process.cwd(), path);

async function fonts() {
  const [bold, light] = await Promise.all([
    readFile(asset("src/fonts/og/montech-v02-700.otf")),
    readFile(asset("src/fonts/og/montech-v02-300.otf")),
  ]);
  return [
    { name: "Montech", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "Montech", data: light, weight: 300 as const, style: "normal" as const },
  ];
}

async function logo(variant: "tinta" | "blanco") {
  const svg = await readFile(asset(`public/brand/chetech-logo-${variant}.svg`), "base64");
  return `data:image/svg+xml;base64,${svg}`;
}

/** Las fotos del catálogo son WebP; se pasan a JPEG porque el generador de imágenes no lo lee. */
async function photo(url: string | undefined) {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    const jpeg = await sharp(Buffer.from(await response.arrayBuffer()))
      .resize(630, 630, { fit: "cover" })
      .jpeg({ quality: 86 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

function nameSize(name: string) {
  if (name.length > 60) return 38;
  if (name.length > 36) return 46;
  return 56;
}

export async function productShareImage(product: Product) {
  const [fontData, logoSrc, photoSrc] = await Promise.all([fonts(), logo("tinta"), photo(product.image)]);
  const name = product.name.length > 84 ? `${product.name.slice(0, 82).trimEnd()}…` : product.name;
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", backgroundColor: papel, fontFamily: "Montech", color: tinta }}>
        <div style={{ display: "flex", width: 630, height: 630, backgroundColor: "#f3f4f1" }}>
          {photoSrc ? <img src={photoSrc} width={630} height={630} alt="" /> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 570, padding: "52px 52px 46px" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, fontWeight: 300, letterSpacing: 2, color: acero }}>
              {`>>>${product.familyName}`}
            </div>
            <div style={{ display: "flex", marginTop: 18, fontSize: nameSize(name), fontWeight: 700, lineHeight: 1.12 }}>{name}</div>
            {product.price > 0 ? (
              <div style={{ display: "flex", marginTop: 26, fontSize: 84, fontWeight: 300, lineHeight: 1 }}>{formatPrice(product.price)}</div>
            ) : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <img src={logoSrc} width={228} height={40} alt="" />
            <div style={{ display: "flex", marginTop: 14, fontSize: 19, fontWeight: 300, letterSpacing: 1.5, color: "#3a3d3d" }}>
              {`${siteConfig.address} · ${siteConfig.location}`}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...shareImageSize, fonts: fontData },
  );
}

export async function siteShareImage() {
  const [fontData, logoSrc] = await Promise.all([fonts(), logo("blanco")]);
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "64px 72px",
          backgroundColor: tinta,
          color: "#ffffff",
          fontFamily: "Montech",
        }}
      >
        <img src={logoSrc} width={342} height={60} alt="" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>Arreglamos tu tele.</div>
          <div style={{ display: "flex", marginTop: 16, fontSize: 40, fontWeight: 300, lineHeight: 1.2 }}>
            Y tenemos todo para que la disfrutes.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 300, letterSpacing: 2, color: "#d0d0d0" }}>
          {`>>>${siteConfig.address} · ${siteConfig.location}`}
        </div>
      </div>
    ),
    { ...shareImageSize, fonts: fontData },
  );
}
