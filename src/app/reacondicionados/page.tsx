import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/store/product-card";
import styles from "@/components/store/landing.module.css";
import { WaitlistForm } from "@/components/store/waitlist-form";
import { getRefurbishedProducts } from "@/lib/catalog";
import { isSellable } from "@/lib/catalog-query";
import { whatsappUrl } from "@/lib/whatsapp";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Teles reacondicionadas",
  description:
    "Televisores reparados y probados en nuestro taller, con garantía escrita. Retiro en Río Tercero.",
  alternates: { canonical: "/reacondicionados" },
};

export default async function RefurbishedPage() {
  const products = (await getRefurbishedProducts()).filter(isSellable);
  const available = products.filter((product) => product.status !== "Sin stock");

  return (
    <div className={`page ${styles.page}`}>
      <nav className={styles.crumbs} aria-label="Ubicación">
        <Link href="/">Inicio</Link>
        <span aria-hidden="true">/</span>
        <span>Reacondicionados</span>
      </nav>
      <header className={styles.head}>
        <h1>Teles reacondicionadas</h1>
        <p>
          Teles que reparamos en el taller y probamos antes de venderlas. Cada una sale con garantía escrita de al
          menos 3 meses.
        </p>
      </header>

      {available.length ? (
        <div className={styles.grid}>
          {available.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} priority={index < 2} />
          ))}
        </div>
      ) : (
        <p className={styles.result} role="status">
          Ahora no tenemos ninguna lista para vender. Entran pocas y se van rápido: dejanos tu contacto y te avisamos.
        </p>
      )}

      <div className={styles.split}>
        <section className={styles.card} aria-labelledby="aviso-tele">
          <h2 id="aviso-tele">Avisame cuando entre una</h2>
          <p>Contanos qué buscás (pulgadas, si es smart) y te escribimos una sola vez, cuando la tengamos.</p>
          <WaitlistForm kind="refurbished" cta="Avisarme" />
        </section>
        <section className={styles.card} aria-labelledby="como-revisamos">
          <h2 id="como-revisamos">Cómo las revisamos</h2>
          <ol className={styles.steps}>
            <li>Diagnóstico en el banco de pruebas.</li>
            <li>Reparación con repuestos probados.</li>
            <li>Prueba de imagen, sonido y entradas antes de publicarla.</li>
            <li>Garantía escrita en la entrega.</li>
          </ol>
          <a
            className="btn"
            data-variant="whatsapp"
            href={whatsappUrl("Hola, CheTech. Quiero saber si tienen alguna tele reacondicionada.")}
            target="_blank"
            rel="noreferrer"
          >
            Preguntar por WhatsApp
          </a>
        </section>
      </div>
    </div>
  );
}
