const STOREFRONT_TIME_ZONE = "America/Argentina/Buenos_Aires";

export function formatDate(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
) {
  return new Intl.DateTimeFormat("es-AR", {
    ...options,
    timeZone: STOREFRONT_TIME_ZONE,
  }).format(new Date(value));
}

export function formatDateOnly(
  value: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return formatDate(value, options);
  const [, year, month, day] = parts;
  const dateAtNoonUtc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  return new Intl.DateTimeFormat("es-AR", {
    ...options,
    timeZone: STOREFRONT_TIME_ZONE,
  }).format(dateAtNoonUtc);
}
