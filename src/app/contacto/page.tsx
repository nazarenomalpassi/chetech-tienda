import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import styles from "@/components/store/landing.module.css";
import { siteConfig } from "@/config/site";
import { whatsappUrl } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Contacto y horarios",
  description:
    "Escribinos por WhatsApp o visitanos en Independencia 784, Río Tercero. Horarios del local y del taller.",
  alternates: { canonical: "/contacto" },
};

export default function ContactPage() {
  const links = [
    {
      href: whatsappUrl("Hola, CheTech. Quiero hacer una consulta."),
      title: "WhatsApp",
      hint: siteConfig.phoneDisplay,
      signal: "verde",
    },
    { href: siteConfig.instagram, title: "Instagram", hint: siteConfig.instagramHandle, signal: "magenta" },
    { href: `mailto:${siteConfig.email}`, title: "Mail", hint: siteConfig.email, signal: "cian" },
    {
      href: siteConfig.mapsUrl,
      title: "Cómo llegar",
      hint: `${siteConfig.address}, ${siteConfig.location}`,
      signal: "azul",
    },
  ];

  return (
    <div className={`page ${styles.page}`}>
      <nav className={styles.crumbs} aria-label="Ubicación">
        <Link href="/">Inicio</Link>
        <span aria-hidden="true">/</span>
        <span>Contacto</span>
      </nav>
      <header className={styles.head}>
        <h1>Contacto</h1>
        <p>
          La forma más rápida es WhatsApp. Si venís al local, el taller y la tienda están en el mismo lugar:{" "}
          {siteConfig.address}, {siteConfig.location}.
        </p>
      </header>

      <div className={styles.split}>
        <nav aria-label="Canales">
          <ul className={styles.links}>
            {links.map((link) => (
              <li key={link.title}>
                <a href={link.href} data-signal={link.signal} target="_blank" rel="noreferrer">
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

        <section className={styles.card} data-signal="verde" aria-labelledby="horarios">
          <h2 id="horarios">Horarios</h2>
          <dl className={styles.hours}>
            {siteConfig.businessHours.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
          <p>Los pedidos de la tienda se retiran en el mismo horario.</p>
        </section>
      </div>
    </div>
  );
}
