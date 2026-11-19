import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { AccountProvider } from "@/components/account-provider";
import { CartProvider } from "@/components/cart-provider";
import { Analytics } from "@/components/store/analytics";
import { CartDrawer } from "@/components/store/cart-drawer";
import { PageProgress } from "@/components/store/page-progress";
import { SiteFooter } from "@/components/store/site-footer";
import { SiteHeader } from "@/components/store/site-header";
import { VisitTracker } from "@/components/store/visit-tracker";
import { families } from "@/config/catalog";
import { siteConfig, tagline } from "@/config/site";
import { getProducts } from "@/lib/catalog";
import { montech, montechCompacta, plex } from "@/lib/fonts";
import { familySummaries } from "@/lib/home";
import { anyOnlinePayment, getStoreSettings } from "@/lib/store-settings";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.baseUrl),
  title: { default: "CheTech · Servicio técnico y tienda de tecnología en Río Tercero", template: "%s · CheTech" },
  description: `${tagline} Teles, placas, controles y accesorios. Comprás online y retirás en ${siteConfig.address}, Río Tercero.`,
  applicationName: "CheTech",
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "CheTech",
    title: "CheTech · Servicio técnico y tienda de tecnología",
    description: tagline,
  },
  twitter: { card: "summary_large_image", title: "CheTech", description: tagline },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#101010",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [settings, products] = await Promise.all([getStoreSettings(), getProducts()]);
  const showWorkshop = products.some((product) => product.family === "del-taller" && product.image);
  // El panel de familias del encabezado muestra solo las que tienen algo publicado con foto.
  const summaries = familySummaries(products);
  const panelFamilies = families
    .map((family) => ({ ...family, count: summaries.get(family.slug)?.count ?? 0, images: summaries.get(family.slug)?.images ?? [] }))
    .filter((family) => family.count > 0 && family.images.length > 0 && (family.slug !== "del-taller" || showWorkshop));
  const announcement = !anyOnlinePayment(settings)
    ? "Armás tu pedido acá, lo reservás por WhatsApp y retirás gratis en Independencia 784."
    : settings.delivery.correo
      ? "Comprás online y retirás gratis en Independencia 784. Envíos a todo el país."
      : "Comprás online y retirás gratis en Independencia 784, Río Tercero.";

  const localBusiness = {
    "@context": "https://schema.org",
    "@type": "ElectronicsStore",
    name: "CheTech",
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
    <html lang="es-AR" className={`${montech.variable} ${montechCompacta.variable} ${plex.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusiness).replace(/</g, "\\u003c") }}
        />
        <AccountProvider>
          <CartProvider>
            <a className="skip-link" href="#contenido">
              Saltar al contenido
            </a>
            <Suspense fallback={null}>
              <PageProgress />
            </Suspense>
            <SiteHeader announcement={announcement} showWorkshop={showWorkshop} panelFamilies={panelFamilies} />
            <main id="contenido">{children}</main>
            <SiteFooter />
            <CartDrawer />
            <Suspense fallback={null}>
              <VisitTracker />
            </Suspense>
            <Analytics />
          </CartProvider>
        </AccountProvider>
      </body>
    </html>
  );
}
