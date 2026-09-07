import type { Metadata } from "next";
import { CatalogClient } from "@/components/catalog-client";
import { CatalogHero } from "@/components/catalog-hero";
import { getBoardProducts } from "@/lib/catalog";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Placas para televisores",
  description:
    "Buscá placas de TV por modelo de televisor, marca o código de placa. Envíos a toda Argentina.",
};

export default async function BoardsPage() {
  const products = await getBoardProducts();
  return (
    <>
      <CatalogHero
        kicker="Placas de televisores"
        title="Placas de TV"
        description="Buscá por modelo o código. Confirmá la compatibilidad antes de comprar."
      />
      <section className="catalog-section catalog-shell">
        <CatalogClient
          products={products}
          boardMode
          emptyTitle="No hay placas disponibles en este momento"
          emptyText="Enviá una foto de la etiqueta del modelo y de la placa por WhatsApp para consultar disponibilidad."
        />
      </section>
    </>
  );
}
