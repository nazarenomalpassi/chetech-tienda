import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ProductCard } from "@/components/store/product-card";
import styles from "@/components/store/landing.module.css";
import { siteConfig } from "@/config/site";
import { getProducts } from "@/lib/catalog";
import { bestSellers } from "@/lib/catalog-query";
import { formatPrice } from "@/lib/format";
import { getStoreSettings } from "@/lib/store-settings";
import { whatsappUrl } from "@/lib/whatsapp";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "CheTech en Instagram",
  description: "Lo que viste en Instagram, el servicio técnico y todo lo de la tienda, en un solo lugar.",
  alternates: { canonical: "/ig" },
};

export default async function InstagramPage() {
  const [products, settings] = await Promise.all([getProducts(), getStoreSettings()]);
  const featured = settings.promo.reelProductSlug
    ? products.find((product) => product.slug === settings.promo.reelProductSlug && product.image)
    : undefined;
  const top = bestSellers(products, 4);

  const links = [
    {
      href: "/productos",
      title: "Ver todos los productos",
      hint: "Con precio, stock y retiro hoy en el local",
    },
    {
      href: "/productos?familia=para-tu-tele",
      title: "Todo para tu tele",
      hint: "ONN, TV Stick, controles, soportes y cables",
    },
    {
      href: whatsappUrl("Hola, CheTech. Vengo de Instagram y quiero un presupuesto para arreglar mi tele."),
      title: "Presupuesto para tu tele",
      hint: "Mandanos una foto por WhatsApp",
      external: true,
    },
    {
      href: "/cuenta/reparaciones",
      title: "Seguí tu reparación",
      hint: "Con el mail que dejaste en el local",
    },
    {
      href: siteConfig.mapsUrl,
      title: "Cómo llegar",
      hint: `${siteConfig.address}, ${siteConfig.location}`,
      external: true,
    },
  ];

  return (
    <div className="page">
      <div className={styles.ig}>
        <header className={styles.igHead}>
          <h1 className={styles.igLogo}>
            <Image src="/brand/chetech-logo-tinta.svg" alt="CheTech" width={228} height={40} priority />
          </h1>
          <p>Arreglamos tu tele. Y tenemos todo para que la disfrutes. {siteConfig.location}.</p>
        </header>

        {featured ? (
          <section aria-labelledby="ig-video">
            <h2 id="ig-video" className={styles.sectionTitle}>
              {settings.promo.reelTitle || "Lo del último video"}
            </h2>
            <Link href={`/productos/${featured.slug}`} className={styles.featured}>
              <Image src={featured.image ?? ""} alt="" width={112} height={112} sizes="112px" />
              <div>
                <strong>{featured.name}</strong>
                <span>{featured.price > 0 ? formatPrice(featured.price) : "Consultar precio"}</span>
              </div>
            </Link>
          </section>
        ) : null}

        <nav aria-label="Enlaces">
          <ul className={styles.links}>
            {links.map((link) => (
              <li key={link.title}>
                <a
                  href={link.href}
                  {...(link.external ? { target: "_blank", rel: "noreferrer" } : {})}
                >
                  <span>
                    <strong>{link.title}</strong>
                    <small>{link.hint}</small>
                  </span>
                  <ChevronRight aria-hidden="true" size={20} />
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {top.length ? (
          <section aria-labelledby="ig-top">
            <h2 id="ig-top" className={styles.sectionTitle}>
              Lo que más se lleva la gente
            </h2>
            <div className={styles.grid}>
              {top.map((product, index) => (
                <ProductCard key={product.id} product={product} index={index} sizes="(max-width: 600px) 50vw, 260px" />
              ))}
            </div>
          </section>
        ) : null}

        <p className={styles.small}>
          Abrimos de lunes a viernes de 09:30 a 19:00, y los sábados de 10:00 a 12:30 y de 16:00 a 20:00.
        </p>
      </div>
    </div>
  );
}
