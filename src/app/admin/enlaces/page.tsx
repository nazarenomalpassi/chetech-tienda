import { siteConfig } from "@/config/site";
import { families } from "@/config/catalog";
import { requireAdmin } from "@/lib/auth";
import { getProducts } from "@/lib/catalog";
import { bestSellers } from "@/lib/catalog-query";
import { LinkBuilder } from "./link-builder";

export const metadata = { title: "Enlaces y QR" };

export default async function AdminLinksPage() {
  await requireAdmin("/admin/enlaces");
  const top = bestSellers(await getProducts(), 30);
  const destinations = [
    { label: "Portada", path: "/" },
    { label: "Todos los productos", path: "/productos" },
    ...families.map((family) => ({ label: `Familia: ${family.name}`, path: `/productos?familia=${family.slug}` })),
    { label: "Servicio técnico", path: "/servicio-tecnico" },
    { label: "Seguí tu reparación", path: "/cuenta/reparaciones" },
    ...top.map((product) => ({ label: `Producto: ${product.name}`, path: `/productos/${product.slug}` })),
  ];
  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">Promoción</p>
        <h1>Enlaces y QR</h1>
        <p>
          Armá el enlace de cada historia, reel o cartel con su origen. El tablero después te muestra cuántas
          visitas y ventas trajo cada uno. Para la biografía de Instagram usá siempre {siteConfig.baseUrl.replace(/^https?:\/\//, "")}/ig.
        </p>
      </div>
      <LinkBuilder baseUrl={siteConfig.baseUrl} destinations={destinations} />
    </>
  );
}
