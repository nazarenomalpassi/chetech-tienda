import type { MetadataRoute } from "next";
import { tagline } from "@/config/site";

// Nombre e ícono de la tienda cuando alguien la agrega a la pantalla de inicio del celular.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CheTech · Servicio técnico y tienda de tecnología",
    short_name: "CheTech",
    description: tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#101010",
    theme_color: "#101010",
    lang: "es-AR",
    icons: [
      { src: "/brand/icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icono-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
