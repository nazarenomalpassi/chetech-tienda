export function formatPrice(value: number) {
  if (value <= 0) return "Consultar precio";
  return formatCurrency(value);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}
