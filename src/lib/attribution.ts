// Origen de la visita: de qué enlace llegó la gente (reel, historia, Google, QR del mostrador).
// Se guarda en el navegador sin datos personales y viaja con el pedido para medir qué vende.

export type Attribution = {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  landing: string;
  at: number;
};

const KEY = "chetech-origen-v1";
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function clean(value: string | null | undefined, max = 80) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, max);
}

export function readAttribution(): Attribution | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null") as Attribution | null;
    if (!parsed || Date.now() - parsed.at > MAX_AGE) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Calcula el origen de esta visita a partir de los parámetros utm o del sitio que la mandó. */
export function attributionFromLocation(href: string, referrer: string): Attribution | null {
  const url = new URL(href);
  const params = url.searchParams;
  const source = clean(params.get("utm_source") ?? params.get("origen"));
  if (source) {
    return {
      source,
      medium: clean(params.get("utm_medium")) || "-",
      campaign: clean(params.get("utm_campaign")) || "-",
      content: clean(params.get("utm_content")) || "-",
      landing: url.pathname.slice(0, 120),
      at: Date.now(),
    };
  }
  // La página /ig es el enlace de la biografía de Instagram: entrar ahí ya dice de dónde viene.
  if (url.pathname === "/ig") {
    return {
      source: "instagram",
      medium: "bio",
      campaign: clean(params.get("campana")) || "-",
      content: clean(params.get("pieza")) || "-",
      landing: "/ig",
      at: Date.now(),
    };
  }
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    if (!host || host === url.hostname.replace(/^www\./, "")) return null;
    const known: Record<string, string> = {
      "l.instagram.com": "instagram",
      "instagram.com": "instagram",
      "m.facebook.com": "facebook",
      "l.facebook.com": "facebook",
      "facebook.com": "facebook",
      "google.com": "google",
      "google.com.ar": "google",
      "bing.com": "bing",
      "wa.me": "whatsapp",
      "web.whatsapp.com": "whatsapp",
    };
    return {
      source: known[host] ?? clean(host, 60),
      medium: known[host] === "google" || known[host] === "bing" ? "organico" : "referido",
      campaign: "-",
      content: "-",
      landing: url.pathname.slice(0, 120),
      at: Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveAttribution(value: Attribution) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Navegación privada o almacenamiento lleno: el pedido sale como "directo".
  }
}

/** Permiso de medición (aviso de cookies) y cookies del píxel de Meta, para informar la compra. */
export function measurementContext() {
  let ads: "accepted" | "rejected" = "rejected";
  try {
    ads = localStorage.getItem("chetech-cookies-v1") === "accepted" ? "accepted" : "rejected";
  } catch {
    ads = "rejected";
  }
  if (ads !== "accepted") return { ads };
  const cookie = (name: string) =>
    document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? "";
  return { ads, fbp: cookie("_fbp"), fbc: cookie("_fbc") };
}
