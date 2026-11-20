import localFont from "next/font/local";

// Las páginas de servicio técnico, seguimiento de reparaciones y Administración se dibujaron para una
// letra condensada. Esta versión de MONTECH ocupa menos (mismo archivo, glifos al 72 %) para que sus
// títulos no se desborden.
//
// Va en un archivo aparte y la usan solo los layouts de esas zonas (con la clase "zona-compacta"): así
// sus tres archivos se precargan ahí y no en la portada, el catálogo ni la compra.
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
