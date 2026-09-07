import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServiceDetailLayout } from "@/components/service-tech";
import {
  getServiceCategory,
  serviceCategories,
  type ServiceCategory,
} from "@/config/service-categories";
import { siteConfig } from "@/config/site";

type Props = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return serviceCategories.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = getServiceCategory((await params).slug);
  if (!category) return { title: "Servicio no encontrado", robots: { index: false } };

  const title = `${category.title} | Servicio técnico`;

  return {
    title,
    description: category.summary,
    alternates: { canonical: category.href },
    openGraph: {
      type: "website",
      url: category.href,
      title: `${title} · Chetech`,
      description: category.summary,
      images: [{ url: category.image, alt: category.imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · Chetech`,
      description: category.summary,
      images: [category.image],
    },
  };
}

function serviceStructuredData(category: ServiceCategory) {
  const pageUrl = `${siteConfig.baseUrl}${category.href}`;
  const businessId = `${siteConfig.baseUrl}/#business`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `${pageUrl}#service`,
        name: category.title,
        serviceType: `Servicio técnico de ${category.shortTitle}`,
        description: category.description,
        url: pageUrl,
        provider: {
          "@type": "ElectronicsStore",
          "@id": businessId,
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
          containedInPlace: {
            "@type": "AdministrativeArea",
            name: "Córdoba",
          },
        },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
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
            item: `${siteConfig.baseUrl}/servicio-tecnico`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: category.title,
            item: pageUrl,
          },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#preguntas-frecuentes`,
        mainEntity: category.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  };
}

export default async function ServiceCategoryPage({ params }: Props) {
  const category = getServiceCategory((await params).slug);
  if (!category) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(serviceStructuredData(category)).replace(/</g, "\\u003c"),
        }}
      />
      <ServiceDetailLayout category={category} />
    </>
  );
}
