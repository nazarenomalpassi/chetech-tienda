import type { MetadataRoute } from "next";
import { serviceCategories } from "@/config/service-categories";
import { siteConfig } from "@/config/site";
import { getProducts } from "@/lib/catalog";

const routes = [
  "",
  "/productos",
  "/placas-tv",
  "/reacondicionados",
  "/servicio-tecnico",
  "/nosotros",
  "/contacto",
  "/legal",
  "/terminos-y-condiciones",
  "/privacidad",
  "/cookies",
  "/envios",
  "/cambios-y-devoluciones",
  "/garantias",
  "/arrepentimiento",
  "/medios-de-pago",
  "/preguntas-frecuentes-legales",
  "/solicitudes-de-privacidad",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getProducts();
  const staticEntries: MetadataRoute.Sitemap = routes.map((route) => ({
    url: `${siteConfig.baseUrl}${route}`,
    changeFrequency: "weekly",
    priority: route === "" ? 1 : 0.8,
  }));
  const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${siteConfig.baseUrl}/productos/${product.slug}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));
  const serviceEntries: MetadataRoute.Sitemap = serviceCategories.map((category) => ({
    url: `${siteConfig.baseUrl}${category.href}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticEntries, ...serviceEntries, ...productEntries];
}
