import type { Metadata } from "next";
import { Clock, Instagram, MapPin, MessageCircle, Navigation } from "lucide-react";
import { CatalogHero } from "@/components/catalog-hero";
import { siteConfig } from "@/config/site";
import { whatsappUrl } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Contacto y horarios",
  description:
    "Contactá a Chetech o visitanos en Independencia 784, Río Tercero. Consultá nuestros horarios de atención.",
};

export default function ContactPage() {
  const cards = [
    [
      MessageCircle,
      "WhatsApp",
      siteConfig.phoneDisplay,
      whatsappUrl("Hola, Chetech. Quiero hacer una consulta."),
    ],
    [Instagram, "Instagram", siteConfig.instagramHandle, siteConfig.instagram],
    [MapPin, "Local", `${siteConfig.address}, ${siteConfig.location}`, siteConfig.mapsUrl],
  ] as const;

  return (
    <>
      <CatalogHero
        kicker="Contacto"
        title="Contacto"
        description="Estamos cerca. Consultá, coordiná un retiro o acercate al local."
      />
      <section className="section shell">
        <div className="contact-grid">
          {cards.map(([Icon, title, text, href]) => (
            <a key={title} href={href} target="_blank" rel="noreferrer">
              <Icon />
              <p className="eyebrow">{title}</p>
              <h2>{text}</h2>
              <span>
                Abrir <Navigation />
              </span>
            </a>
          ))}
        </div>

        <div className="contact-details-grid">
          <section className="contact-hours">
            <Clock />
            <p className="eyebrow">Horarios de atención</p>
            <h2>Cuándo visitarnos</h2>
            <dl className="hours-list">
              {siteConfig.businessHours.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="contact-location">
            <MapPin />
            <p className="eyebrow">Ubicación</p>
            <h2>{siteConfig.address}</h2>
            <p>{siteConfig.location}</p>
            <a className="button light" href={siteConfig.mapsUrl} target="_blank" rel="noreferrer">
              Abrir en Google Maps
            </a>
          </section>
        </div>
      </section>
    </>
  );
}
