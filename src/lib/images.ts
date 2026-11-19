// E10: versión mínima (32 px) de la misma foto, servida por el optimizador de Next. Se muestra borrosa
// mientras carga la foto real, así nunca queda un hueco gris.
export function lqip(src: string | undefined | null) {
  if (!src) return undefined;
  return `url("/_next/image?url=${encodeURIComponent(src)}&w=32&q=75")`;
}

/** Marca la foto como cargada para que se apague la versión borrosa de atrás. */
export function markLoaded(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.dataset.loaded = "true";
}

/** Un video se puede reproducir en la página solo si es un archivo; Instagram y YouTube van como enlace. */
export function isDirectVideo(url: string | undefined | null) {
  return Boolean(url && /\.(mp4|webm|mov)(\?|#|$)/i.test(url));
}

export function videoSourceName(url: string) {
  if (/instagram\.com/i.test(url)) return "Instagram";
  if (/youtu\.?be/i.test(url)) return "YouTube";
  if (/tiktok\.com/i.test(url)) return "TikTok";
  return "el video";
}
