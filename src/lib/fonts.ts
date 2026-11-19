import localFont from "next/font/local";
import { IBM_Plex_Sans } from "next/font/google";

// Tipografía primaria del manual de marca: MONTECH V.02 (solo mayúsculas). Se usa en títulos, menú,
// botones, etiquetas y precios, igual que en la papelería y las placas de redes.
// Los archivos son un recorte con los caracteres del español; los originales están en la carpeta MARCA.
export const montech = localFont({
  src: [
    { path: "../fonts/montech-v02-300.woff2", weight: "300", style: "normal" },
    { path: "../fonts/montech-v02-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/montech-v02-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/montech-v02-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-montech",
  display: "swap",
  fallback: ["Arial Narrow", "Arial", "sans-serif"],
});

// Las páginas de servicio técnico, cuenta y legales se dibujaron para una letra condensada. Esta versión
// de MONTECH ocupa menos (mismo archivo, glifos al 72 %) para que sus títulos no se desborden.
export const montechCompacta = localFont({
  src: [
    { path: "../fonts/montech-v02-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/montech-v02-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/montech-v02-700.woff2", weight: "700 900", style: "normal" },
  ],
  variable: "--font-montech-compacta",
  display: "swap",
  fallback: ["Arial Narrow", "Arial", "sans-serif"],
  adjustFontFallback: false,
  declarations: [{ prop: "size-adjust", value: "72%" }],
});

// Texto corrido: nombres de producto, descripciones y formularios. MONTECH no tiene minúsculas, así que
// la lectura larga va en una sans de dibujo técnico que la acompaña.
export const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
  display: "swap",
});
