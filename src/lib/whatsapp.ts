import { siteConfig } from "@/config/site";
import type { Product } from "@/lib/types";

export type CheckoutDetails = {
  name?: string;
  location?: string;
  postalCode?: string;
  delivery?: string;
  payment?: string;
  notes?: string;
};

export function cleanWhatsAppText(value: unknown, maxLength = 200) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function whatsappUrl(message: string) {
  return `https://wa.me/${siteConfig.whatsapp}?text=${encodeURIComponent(message.slice(0, 4000))}`;
}

/** Enlace para escribirle a un cliente desde Administración. Acepta números argentinos cargados a mano. */
export function customerWhatsAppUrl(phone: string, message: string) {
  let digits = phone.replace(/\D/g, "").replace(/^00/, "");
  if (digits.startsWith("54")) digits = digits.slice(2);
  if (digits.startsWith("9")) digits = digits.slice(1);
  digits = digits.replace(/^0/, "");
  return `https://wa.me/549${digits}?text=${encodeURIComponent(message.slice(0, 1000))}`;
}

export function productWhatsApp(product: Product, compatibility = false) {
  const lines = [
    "Hola, CheTech.",
    compatibility
      ? "Quiero consultar compatibilidad de esta placa:"
      : "Quiero consultar por este producto:",
    cleanWhatsAppText(product.name),
    `SKU: ${cleanWhatsAppText(product.sku, 80)}`,
  ];
  if (product.board?.code) lines.push(`Código: ${cleanWhatsAppText(product.board.code, 100)}`);
  if (product.model) lines.push(`Modelo: ${cleanWhatsAppText(product.model, 100)}`);
  lines.push(
    `Enlace: ${siteConfig.baseUrl}/productos/${encodeURIComponent(cleanWhatsAppText(product.slug, 160))}`,
  );
  return whatsappUrl(lines.join("\n"));
}

/** Pedido completo por WhatsApp: se usa cuando todavía no hay ningún medio de pago online activo. */
export function cartWhatsApp(
  items: { name: string; sku: string; quantity: number; price: number }[],
  customer: { name: string; notes?: string },
  total: number,
) {
  const money = (value: number) => `$ ${Math.round(value).toLocaleString("es-AR")}`;
  const lines = [
    "Hola, CheTech. Quiero reservar este pedido para retirar en el local:",
    "",
    ...items.map(
      (item) => `${item.quantity} x ${cleanWhatsAppText(item.name, 120)} (${cleanWhatsAppText(item.sku, 40)}): ${money(item.price * item.quantity)}`,
    ),
    "",
    `Total: ${money(total)}`,
    `A nombre de: ${cleanWhatsAppText(customer.name, 80)}`,
  ];
  if (customer.notes) lines.push(`Nota: ${cleanWhatsAppText(customer.notes, 300)}`);
  return whatsappUrl(lines.join("\n"));
}
