import type { Metadata } from "next";
import { CatalogClient } from "@/components/catalog-client";
import { CatalogHero } from "@/components/catalog-hero";
import { getRefurbishedProducts } from "@/lib/catalog";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Reacondicionados",
  description: "Equipos reacondicionados y usados seleccionados, revisados por Chetech.",
};

export default async function RefurbishedPage() {
  const products = await getRefurbishedProducts();
  return (
    <>
      <CatalogHero
        kicker="Revisados por Chetech"
        title="Reacondicionados"
        description="Equipos seleccionados, revisados y probados por nuestro servicio técnico."
      />
      <section className="catalog-section catalog-shell">
        <CatalogClient
          products={products}
          emptyTitle="No hay reacondicionados disponibles en este momento"
          emptyText="Consultanos por WhatsApp para conocer los equipos disponibles."
        />
      </section>
    </>
  );
}
