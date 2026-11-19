import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/carrito", "/pedido/", "/cuenta", "/admin", "/emails/", "/ingresar", "/registrarse"] },
    sitemap: `${siteConfig.baseUrl}/sitemap.xml`,
    host: siteConfig.baseUrl,
  };
}
