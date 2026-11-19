const priceFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const plainFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** "$ 150.000" */
export function formatPrice(value: number) {
  return priceFormatter.format(Math.round(value)).replace(/ /g, " ");
}

export function formatCurrency(value: number) {
  return formatPrice(value);
}

/** "150.000" sin el signo, para armar precios con tipografía propia. */
export function formatNumber(value: number) {
  return plainFormatter.format(Math.round(value));
}

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Cordoba",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(value: string | Date) {
  return dateTimeFormatter.format(typeof value === "string" ? new Date(value) : value);
}

const shortDateFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Cordoba",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatShortDateTime(value: string | Date) {
  return shortDateFormatter.format(typeof value === "string" ? new Date(value) : value);
}
