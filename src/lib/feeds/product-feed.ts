import "server-only";

import { siteConfig } from "@/config/site";
import { getProducts } from "@/lib/catalog";
import { isSellable } from "@/lib/catalog-query";
import type { Product } from "@/lib/types";

// Catálogo para Meta (Instagram y Facebook) y Google Merchant Center, en el formato RSS con los campos
// de Google que aceptan los dos. Solo entran productos con foto y precio.

const escape = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const tag = (name: string, value: string | number | undefined | null) =>
  value === undefined || value === null || value === "" ? "" : `      <${name}>${escape(String(value))}</${name}>\n`;

function condition(product: Product) {
  if (product.condition === "Nuevo") return "new";
  if (product.condition === "Reacondicionado") return "refurbished";
  return "used";
}

function availability(product: Product) {
  return product.status === "Sin stock" ? "out_of_stock" : "in_stock";
}

function absolute(url: string) {
  return url.startsWith("http") ? url : `${siteConfig.baseUrl.replace(/\/$/, "")}${url}`;
}

export type FeedTarget = "meta" | "google";

export async function productFeed(target: FeedTarget) {
  const base = siteConfig.baseUrl.replace(/\/$/, "");
  const products = (await getProducts()).filter((product) => isSellable(product) && product.price > 0);
  const items = products
    .map((product) => {
      const link = `${base}/productos/${product.slug}?utm_source=${target}&utm_medium=catalogo&utm_campaign=catalogo&utm_content=${encodeURIComponent(product.sku)}`;
      const images = product.images.filter((image) => image && image !== product.image).slice(0, 9);
      const description = (product.description || product.shortDescription || product.name).slice(0, 4900);
      const brand = product.brand?.trim() || (target === "meta" ? "Sin marca" : "");
      return [
        "    <item>\n",
        tag("g:id", product.sku),
        tag("g:title", product.name.slice(0, 150)),
        tag("g:description", description),
        tag("g:link", link),
        tag("g:image_link", absolute(product.image ?? "")),
        ...images.map((image) => tag("g:additional_image_link", absolute(image))),
        tag("g:availability", availability(product)),
        tag("g:condition", condition(product)),
        ...(product.previousPrice && product.previousPrice > product.price
          ? [
              tag("g:price", `${product.previousPrice.toFixed(2)} ARS`),
              tag("g:sale_price", `${product.price.toFixed(2)} ARS`),
            ]
          : [tag("g:price", `${product.price.toFixed(2)} ARS`)]),
        tag("g:brand", brand),
        tag("g:mpn", product.model || undefined),
        tag("g:identifier_exists", product.model ? undefined : "no"),
        tag("g:product_type", `${product.familyName} > ${product.category}`),
        tag("g:custom_label_0", product.familyName),
        tag("g:custom_label_1", product.popularityRank && product.popularityRank <= 40 ? "mas vendido" : undefined),
        tag("g:shipping_label", product.shipping && product.shippingSize !== "no_viaja" ? product.shippingSize : "solo retiro"),
        "    </item>\n",
      ].join("");
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escape(`${siteConfig.name} tienda`)}</title>
    <link>${escape(base)}</link>
    <description>${escape(siteConfig.description)}</description>
${items}  </channel>
</rss>
`;
}
