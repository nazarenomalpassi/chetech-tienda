import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/store/product-card";
import { ScrollMotion } from "@/components/store/scroll-motion";
import { BuyBox } from "@/components/store/product/buy-box";
import { ProductGallery } from "@/components/store/product/gallery";
import { isDirectVideo, videoSourceName } from "@/lib/images";
import { PickupLine } from "@/components/store/product/pickup-line";
import { StockStatus } from "@/components/store/stock-status";
import { familyBySlug } from "@/config/catalog";
import { siteConfig } from "@/config/site";
import { getProduct, getProducts, getRelatedProducts } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { pickupSentence, pickupWindow } from "@/lib/hours";
import { getStoreSettings } from "@/lib/store-settings";
import { productWhatsApp } from "@/lib/whatsapp";
import styles from "./product.module.css";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const products = await getProducts();
  return products.filter((product) => product.image).slice(0, 60).map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  if (!product) return { title: "Producto no encontrado" };
  const description = (product.shortDescription || product.description).slice(0, 160);
  return {
    title: product.name,
    description,
    alternates: { canonical: `/productos/${product.slug}` },
    openGraph: { title: product.name, description },
  };
}

export default async function ProductPage({ params }: Props) {
  const product = await getProduct((await params).slug);
  if (!product) notFound();

  const [related, settings] = await Promise.all([getRelatedProducts(product, 4), getStoreSettings()]);
  const family = familyBySlug.get(product.family);
  const description = product.description || product.shortDescription;
  const isPart = Boolean(product.board) || /\b(placa|repuesto)\b/i.test(product.name);
  const compatible = product.board?.compatibleModels.length ? product.board.compatibleModels : product.compatibleWith;
  const ships = settings.delivery.correo && product.shipping && product.shippingSize !== "no_viaja";
  const label: [string, string][] = [
    ["Marca", product.brand],
    ["Modelo", product.model],
    ["Código", product.sku],
    ["Condición", product.condition],
    ["Garantía", product.warrantyMonths > 0 ? `${product.warrantyMonths} meses` : "Sin garantía"],
    ...(product.board
      ? ([
          ["Código de placa", product.board.code],
          ["Número de parte", product.board.partNumber ?? ""],
          ["Tipo", product.board.type],
        ] as [string, string][])
      : []),
    ...Object.entries(product.specifications),
  ].filter(([, value]) => Boolean(value && String(value).trim())) as [string, string][];

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    description,
    image: product.images,
    category: product.familyName,
    itemCondition:
      product.condition === "Nuevo" ? "https://schema.org/NewCondition" : "https://schema.org/RefurbishedCondition",
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    offers: {
      "@type": "Offer",
      url: `${siteConfig.baseUrl}/productos/${product.slug}`,
      priceCurrency: "ARS",
      price: product.price,
      availability:
        product.status === "Sin stock" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      seller: { "@type": "Organization", name: "CheTech" },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "AR",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 10,
      },
    },
  };

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <ScrollMotion signature={product.slug} className="page">
        <nav aria-label="Ruta" className={styles.crumbs}>
          <Link href="/">Inicio</Link>
          <span aria-hidden>/</span>
          <Link href="/productos">Productos</Link>
          {family ? (
            <>
              <span aria-hidden>/</span>
              <Link href={`/productos?familia=${family.slug}`}>{family.name}</Link>
            </>
          ) : null}
        </nav>

        <div className={styles.layout}>
          <div className={styles.galleryColumn} data-product-stage>
            <ProductGallery slug={product.slug} name={product.name} images={product.images} videoUrl={product.videoUrl} />
            {product.videoUrl && !isDirectVideo(product.videoUrl) ? (
              <a className={`enlace ${styles.videoLink}`} href={product.videoUrl} target="_blank" rel="noreferrer">
                Mirá cómo funciona en {videoSourceName(product.videoUrl)}
              </a>
            ) : null}
          </div>

          <div className={styles.info}>
            <div className={styles.titleBlock}>
              <p className={styles.family}>{product.familyName}</p>
              <h1>{product.name}</h1>
              {product.brand || product.model ? (
                <p className={styles.brand}>{[product.brand, product.model].filter(Boolean).join(", ")}</p>
              ) : null}
            </div>

            <div className={styles.priceBlock}>
              <p className={styles.priceRow}>
                <span className={styles.priceMask}>
                  <span className={`price ${styles.price}`}>{formatPrice(product.price)}</span>
                </span>
                {product.previousPrice ? <s className={styles.before}>{formatPrice(product.previousPrice)}</s> : null}
              </p>
              <p className={styles.priceNote}>Precio final en pesos.</p>
              {settings.payments.mercadopago && product.price >= 100_000 ? (
                <p className={styles.installments}>Pagás en cuotas con tarjeta a través de Mercado Pago.</p>
              ) : null}
            </div>

            <StockStatus status={product.status} />

            <BuyBox product={product} whatsappHref={productWhatsApp(product, isPart)} />

            <ul className={styles.delivery}>
              <li>
                <strong>
                  <PickupLine fallback={pickupSentence(pickupWindow())} />
                </strong>
                <span>Retiro gratis en {siteConfig.address}, Río Tercero.</span>
              </li>
              {ships ? (
                <li>
                  <strong>Envío por Correo Argentino</strong>
                  <span>El costo se calcula en el carrito.</span>
                </li>
              ) : product.shippingSize === "no_viaja" ? (
                <li>
                  <strong>Se retira en el local</strong>
                  <span>Este producto no se envía por correo.</span>
                </li>
              ) : null}
              <li>
                <strong>{product.warranty}</strong>
                <span>
                  {product.warrantyIsLegalMinimum
                    ? "Es la garantía que fija la ley. La cubrimos nosotros en el local."
                    : "La cubrimos nosotros en el local."}
                </span>
              </li>
            </ul>

            {compatible.length ? (
              <div className={styles.compat}>
                <h2>Compatible con</h2>
                <ul>
                  {compatible.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {isPart ? (
              <p className={styles.partHelp}>
                ¿No sabés si sirve para tu equipo? Mandanos una foto de la etiqueta o del código por WhatsApp y te lo
                confirmamos.
              </p>
            ) : null}
          </div>
        </div>

        <div className={styles.details}>
          {description ? (
            <section aria-labelledby="descripcion">
              <h2 id="descripcion" data-anim="titulo">
                Descripción
              </h2>
              <div className={styles.description} data-anim="bloque">
                {description.split(/\n{2,}/).map((paragraph) => (
                  <p key={paragraph.slice(0, 40)}>{paragraph}</p>
                ))}
              </div>
            </section>
          ) : null}

          <section aria-labelledby="etiqueta">
            <h2 id="etiqueta" data-anim="titulo">
              Etiqueta técnica
            </h2>
            <div className={styles.label} data-anim="bloque">
              <div className={styles.labelHead}>
                <span>CheTech</span>
                <span className={styles.labelCode}>{product.sku}</span>
              </div>
              <dl>
                {label.map(([name, value]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {product.boxContents ? (
                <div className={styles.box}>
                  <p>Qué trae la caja</p>
                  <p>{product.boxContents}</p>
                </div>
              ) : null}
              <div className="barras" aria-hidden />
            </div>
          </section>
        </div>

        {related.length ? (
          <section className={styles.related} aria-labelledby="combina">
            <h2 id="combina" data-anim="titulo">
              Combina con
            </h2>
            <div className={styles.relatedGrid}>
              {related.map((item, index) => (
                <ProductCard key={item.id} product={item} index={index} />
              ))}
            </div>
          </section>
        ) : null}
      </ScrollMotion>
    </div>
  );
}
