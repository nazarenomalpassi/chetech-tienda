// Configuración del catálogo: familias, entradas por necesidad, sinónimos y filtros.
// Todo lo que acá se nombra sale de lo que el local vende de verdad (ver plan, sección 2).

export type FamilyMeta = {
  slug: string;
  name: string;
  description: string;
  /** Color de señal de la carta de ajuste que identifica a la familia. */
  signal: "amarillo" | "cian" | "verde" | "magenta" | "rojo" | "azul" | "gris";
};

export const families: FamilyMeta[] = [
  {
    slug: "para-tu-tele",
    name: "Para tu tele",
    description: "ONN, TV Stick, controles, soportes y cables HDMI.",
    signal: "amarillo",
  },
  {
    slug: "carga-y-energia",
    name: "Carga y energía",
    description: "Cargadores, cables, adaptadores, pilas y zapatillas.",
    signal: "verde",
  },
  {
    slug: "audio",
    name: "Audio",
    description: "Auriculares, parlantes y micrófonos.",
    signal: "cian",
  },
  {
    slug: "celular",
    name: "Celular",
    description: "Fundas, vidrios templados y soportes para auto.",
    signal: "azul",
  },
  {
    slug: "compu-y-gaming",
    name: "Compu y gaming",
    description: "Teclados, mouse, pendrives y joysticks.",
    signal: "rojo",
  },
  {
    slug: "hogar",
    name: "Hogar",
    description: "Iluminación, freidoras, pavas, ventiladores y estufas.",
    signal: "gris",
  },
  {
    slug: "del-taller",
    name: "Del taller",
    description: "Teles revisadas y placas probadas en el banco de pruebas.",
    signal: "magenta",
  },
];

export const familyBySlug = new Map(families.map((family) => [family.slug, family]));

export type Need = {
  slug: string;
  label: string;
  /** Texto corto que explica qué se va a encontrar. */
  hint: string;
  /** Se cumple si el nombre, la categoría o la familia coinciden. */
  match: RegExp;
  href?: string;
};

export const needs: Need[] = [
  {
    slug: "tele-smart",
    label: "Mi tele no es Smart",
    hint: "ONN y TV Stick",
    match: /\b(onn|tv ?stick)\b/i,
  },
  {
    slug: "control",
    label: "Perdí el control",
    hint: "Controles para TV",
    match: /\bcontrol\b/i,
  },
  {
    slug: "colgar-tele",
    label: "Quiero colgar la tele",
    hint: "Soportes y HDMI",
    match: /\bsoporte\b.*\btv\b|\btv\b.*\bsoporte\b|\bhdmi\b/i,
  },
  {
    slug: "cargador",
    label: "Se rompió el cargador",
    hint: "Cargadores y cables",
    match: /\b(cargador|fuente|cable)\b/i,
  },
  {
    slug: "pilas",
    label: "Necesito pilas",
    hint: "AA, AAA, botón y más",
    match: /\b(pila|pilas|bater[ií]a|energizer|maxell|vinnic|cr ?20\d\d|lr ?\d+)\b/i,
  },
  {
    slug: "reparar",
    label: "Quiero reparar un equipo",
    hint: "Diagnóstico en el taller",
    match: /$^/,
    href: "/servicio-tecnico",
  },
];

export const needBySlug = new Map(needs.map((need) => [need.slug, need]));

export type CompatFilter = { slug: string; label: string; match: RegExp };

export const compatFilters: CompatFilter[] = [
  { slug: "usb-c", label: "USB-C", match: /\b(tipo ?c|type ?c|usb ?c|c a c|c a lightning|a c\b)/i },
  { slug: "lightning", label: "Lightning (iPhone)", match: /\b(lightning|iphone)\b/i },
  { slug: "micro-usb", label: "Micro USB", match: /\bmicro ?usb\b|\bv8\b/i },
  { slug: "hdmi", label: "HDMI", match: /\bhdmi\b/i },
  { slug: "bluetooth", label: "Bluetooth", match: /\b(bluetooth|bt)\b/i },
];

export const priceRanges = [
  { slug: "hasta-10000", label: "Hasta $ 10.000", min: 0, max: 10_000 },
  { slug: "10000-30000", label: "$ 10.000 a $ 30.000", min: 10_000, max: 30_000 },
  { slug: "30000-100000", label: "$ 30.000 a $ 100.000", min: 30_000, max: 100_000 },
  { slug: "mas-de-100000", label: "Más de $ 100.000", min: 100_000, max: Number.POSITIVE_INFINITY },
];

// Lo que la gente escribe → cómo está cargado en el catálogo.
export const searchSynonyms: Record<string, string[]> = {
  iphone: ["lightning", "apple"],
  apple: ["lightning", "iphone"],
  celu: ["celular"],
  celular: ["funda", "vidrio", "cargador"],
  tele: ["tv", "televisor"],
  televisor: ["tv"],
  smart: ["onn", "stick"],
  chromecast: ["onn", "stick"],
  firestick: ["stick", "onn"],
  auris: ["auricular", "auriculares"],
  auriculares: ["auricular"],
  joystick: ["joystick", "grips"],
  joistick: ["joystick"],
  parlante: ["parlantes", "radio"],
  pila: ["pilas", "bateria"],
  pilas: ["pila", "bateria"],
  zapatilla: ["zapatilla", "prolongador"],
  alargue: ["prolongador", "zapatilla"],
  ficha: ["adaptador"],
  cargador: ["cargador", "fuente"],
  mouse: ["mouse", "raton"],
  pendrive: ["pendrive", "usb"],
  soporte: ["soporte", "bracket"],
  hdmi: ["hdmi"],
  tipoc: ["tipo c"],
  "tipo-c": ["tipo c"],
  "usb-c": ["tipo c"],
};

export const PAGE_SIZE = 24;
