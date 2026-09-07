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

export function productWhatsApp(product: Product, compatibility = false) {
  const lines = [
    "Hola, Chetech.",
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
    "Precio y disponibilidad sujetos a confirmación.",
  );
  return whatsappUrl(lines.join("\n"));
}
