// E10: versión mínima (32 px) de la misma foto, servida por el optimizador de Next. Se muestra borrosa
// mientras carga la foto real, así nunca queda un hueco gris.
export function lqip(src: string | undefined | null) {
  if (!src) return undefined;
  return `url("/_next/image?url=${encodeURIComponent(src)}&w=32&q=75")`;
}

/**
 * Marca la foto como cargada para que se apague la versión borrosa de atrás. Si la foto ya estaba en
 * pantalla hacía rato (llegó antes de que la página empezara a andar, o venía de la caché), se marca
 * "antes": los estilos no la vuelven a hacer aparecer, porque parpadearía.
 */
export function markLoaded(event: React.SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  const entry = performance.getEntriesByName(image.currentSrc).pop() as PerformanceResourceTiming | undefined;
  const alreadyThere = entry ? performance.now() - entry.responseEnd > 400 : false;
  image.dataset.loaded = alreadyThere ? "antes" : "true";
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
