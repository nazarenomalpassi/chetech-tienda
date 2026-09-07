import type { Metadata, Viewport } from "next";
import { AccountProvider } from "@/components/account-provider";
import { CartProvider } from "@/components/cart-provider";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { RevealOnScroll } from "@/components/reveal-on-scroll";
import { siteConfig } from "@/config/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.baseUrl),
  title: { default: "Chetech · Tecnología y servicio técnico", template: "%s · Chetech" },
  description: siteConfig.description,
  applicationName: "Chetech",
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "Chetech",
    title: "Chetech · Tecnología que responde",
    description: siteConfig.description,
  },
  twitter: { card: "summary_large_image", title: "Chetech", description: siteConfig.description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a0c0e",
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const localBusiness = {
    "@context": "https://schema.org",
    "@type": "ElectronicsStore",
    name: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.baseUrl,
    telephone: `+${siteConfig.whatsapp}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: siteConfig.address,
      addressLocality: "Río Tercero",
      addressRegion: "Córdoba",
      addressCountry: "AR",
    },
    sameAs: [siteConfig.instagram],
    openingHoursSpecification: siteConfig.openingHoursSpecification.map((hours) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: hours.dayOfWeek,
      opens: hours.opens,
      closes: hours.closes,
    })),
  };
  return (
    <html lang="es">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(localBusiness).replace(/</g, "\\u003c"),
          }}
        />
        <AccountProvider>
          <CartProvider>
            <a className="skip-link" href="#contenido">
              Saltar al contenido
            </a>
            <Header />
            <main id="contenido">{children}</main>
            <Footer />
            <RevealOnScroll />
          </CartProvider>
        </AccountProvider>
      </body>
    </html>
  );
}
