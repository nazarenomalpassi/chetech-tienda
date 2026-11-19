import type { OrderPayload } from "@/lib/commerce/types";

export type DiscountLine = { label: string; amount: number };

type Discounted = {
  discount_total: number | string;
  coupon_code?: string | null;
  discount_detail?: OrderPayload["discount_detail"];
};

/** Renglones de descuento de un pedido, listos para mostrar en el comprobante, el mail y Administración. */
export function discountLines(order: Discounted): DiscountLine[] {
  const total = Number(order.discount_total) || 0;
  if (total <= 0) return [];
  const lines: DiscountLine[] = [];
  const coupon = order.discount_detail?.coupon;
  const transfer = order.discount_detail?.transfer;
  if (coupon && Number(coupon.amount) > 0) {
    lines.push({ label: `Cupón ${coupon.code} (${Number(coupon.percent)} %)`, amount: Number(coupon.amount) });
  }
  if (transfer && Number(transfer.amount) > 0) {
    lines.push({ label: `Pago por transferencia (${Number(transfer.percent)} %)`, amount: Number(transfer.amount) });
  }
  const detailed = lines.reduce((sum, line) => sum + line.amount, 0);
  // Si el detalle no explica todo el descuento, el resto se muestra igual para que el total cierre.
  if (Math.abs(total - detailed) > 0.01) {
    lines.push({ label: order.coupon_code && !coupon ? `Cupón ${order.coupon_code}` : "Descuento", amount: total - detailed });
  }
  return lines;
}
