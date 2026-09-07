import type { Metadata } from "next";
import { ServiceLanding } from "@/components/service-tech";
import { serviceCategories, serviceLandingHero } from "@/config/service-categories";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Servicio técnico de tecnología en Río Tercero",
  description:
    "Diagnóstico, reparación y mantenimiento de computadoras, televisores, celulares, consolas y equipos electrónicos en Río Tercero.",
  alternates: { canonical: "/servicio-tecnico" },
  openGraph: {
    type: "website",
    url: "/servicio-tecnico",
    title: "Servicio técnico de tecnología · Chetech",
    description:
      "Conocé nuestros servicios, el proceso de reparación y las soluciones disponibles para cada tipo de equipo.",
    images: [
      {
        url: serviceLandingHero.image,
        alt: serviceLandingHero.imageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Servicio técnico de tecnología · Chetech",
    description:
      "Conocé nuestros servicios, el proceso de reparación y las soluciones disponibles para cada tipo de equipo.",
    images: [serviceLandingHero.image],
  },
};

function serviceCatalogStructuredData() {
  const pageUrl = `${siteConfig.baseUrl}/servicio-tecnico`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `${pageUrl}#service`,
        name: "Servicio técnico Chetech",
        description: metadata.description,
        url: pageUrl,
        provider: {
          "@type": "ElectronicsStore",
          "@id": `${siteConfig.baseUrl}/#business`,
          name: siteConfig.name,
          url: siteConfig.baseUrl,
          telephone: `+${siteConfig.whatsapp}`,
          address: {
            "@type": "PostalAddress",
            streetAddress: siteConfig.address,
            addressLocality: "Río Tercero",
            addressRegion: "Córdoba",
            addressCountry: "AR",
          },
        },
        areaServed: {
          "@type": "City",
          name: "Río Tercero",
        },
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: "Categorías de servicio técnico",
          itemListElement: serviceCategories.map((category) => ({
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: category.title,
              description: category.summary,
              url: `${siteConfig.baseUrl}${category.href}`,
            },
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Inicio",
            item: siteConfig.baseUrl,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Servicio técnico",
            item: pageUrl,
          },
        ],
      },
    ],
  };
}

export default function ServicePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(serviceCatalogStructuredData()).replace(/</g, "\\u003c"),
        }}
      />
      <ServiceLanding />
    </>
  );
}
