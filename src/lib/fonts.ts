import { Barlow, Barlow_Condensed } from "next/font/google";

// Barlow Condensed conserva el carácter de la Bahnschrift anterior, que solo existía en Windows,
// y carga igual en cualquier celular. Se sirven desde el propio dominio, sin saltos al cargar.
export const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-barlow",
  display: "swap",
});

export const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-barlow-condensed",
  display: "swap",
});
