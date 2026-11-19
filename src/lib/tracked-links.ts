// Enlaces medibles: cada pieza (historia, reel, QR del mostrador) lleva su origen, así el tablero de
// Administración muestra qué trajo visitas y ventas. La tienda lee estos parámetros en attribution.ts.

export type LinkPreset = {
  key: string;
  label: string;
  hint: string;
  source: string;
  medium: string;
  /** true: lo normal es imprimirlo como QR. */
  qr?: boolean;
};

export const linkPresets: LinkPreset[] = [
  { key: "historia", label: "Historia de Instagram", hint: "Sticker de enlace en la historia", source: "instagram", medium: "historia" },
  { key: "reel", label: "Reel de Instagram", hint: "Enlace en el comentario fijado o en la descripción", source: "instagram", medium: "reel" },
  { key: "estado", label: "Estado de WhatsApp", hint: "Enlace en el estado o en un mensaje", source: "whatsapp", medium: "estado" },
  { key: "google", label: "Perfil de Google", hint: "Botón Sitio web del Perfil de Negocio", source: "google", medium: "perfil" },
  { key: "mostrador", label: "QR del mostrador", hint: "Para imprimir y dejar al lado de la caja", source: "qr", medium: "mostrador", qr: true },
  { key: "vidriera", label: "QR de la vidriera", hint: "Para que compren con el local cerrado", source: "qr", medium: "vidriera", qr: true },
  { key: "paquete", label: "QR del paquete", hint: "Tarjeta dentro de cada envío", source: "qr", medium: "paquete", qr: true },
  { key: "taller", label: "QR del comprobante del taller", hint: "Para quien retira una reparación", source: "taller", medium: "comprobante", qr: true },
];

const slug = (value: string, max = 60) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);

export type TrackedLinkInput = {
  baseUrl: string;
  /** Página de destino dentro de la tienda: "/", "/productos/onn-4k" o un enlace completo de la tienda. */
  path: string;
  source: string;
  medium: string;
  campaign?: string;
  content?: string;
};

/** Devuelve el enlace con su origen. Si el destino no es de la tienda, devuelve null. */
export function buildTrackedUrl(input: TrackedLinkInput): string | null {
  const base = new URL(input.baseUrl);
  let target: URL;
  try {
    target = new URL(input.path.trim() || "/", base);
  } catch {
    return null;
  }
  if (target.host.replace(/^www\./, "") !== base.host.replace(/^www\./, "")) return null;
  const url = new URL(target.pathname, base);
  // Se conservan los filtros del destino (familia, búsqueda) y se pisan los de medición.
  target.searchParams.forEach((value, key) => {
    if (!key.startsWith("utm_") && key !== "origen") url.searchParams.set(key, value);
  });
  const source = slug(input.source);
  if (!source) return null;
  url.searchParams.set("utm_source", source);
  const medium = slug(input.medium);
  if (medium) url.searchParams.set("utm_medium", medium);
  const campaign = slug(input.campaign ?? "", 80);
  if (campaign) url.searchParams.set("utm_campaign", campaign);
  const content = slug(input.content ?? "", 80);
  if (content) url.searchParams.set("utm_content", content);
  return url.toString();
}
