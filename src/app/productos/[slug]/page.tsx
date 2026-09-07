import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MapPin, ShieldCheck, Truck } from "lucide-react";
import { notFound } from "next/navigation";
import { ProductActions } from "@/components/product-actions";
import { ProductCard } from "@/components/product-card";
import { ProductGallery } from "@/components/product-gallery";
import { siteConfig } from "@/config/site";
import { formatPrice } from "@/lib/format";
import { getProduct, getRelatedProducts } from "@/lib/catalog";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  if (!product) return { title: "Producto no encontrado" };
  const description = product.description || product.shortDescription;
  return {
    title: product.name,
    description,
    alternates: { canonical: `/productos/${product.slug}` },
    openGraph: {
      title: product.name,
      description,
      images: product.images,
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const product = await getProduct((await params).slug);
  if (!product) notFound();

  const related = await getRelatedProducts(product, 4);
  const productDescription = product.description || product.shortDescription;
  const specifications = Object.entries(product.specifications).filter(([, value]) =>
    Boolean(value),
  );
  const hasTechnicalData = specifications.length > 0 || Boolean(product.board);
  const isSpecificPart = Boolean(product.board) || /\b(placa|repuesto)\b/i.test(product.name);
  const isElectricalMatchProduct =
    /\bfuente\b/i.test(product.name) || /cargador universal para notebook/i.test(product.name);
  const needsCompatibilityHelp = isSpecificPart || isElectricalMatchProduct;
  const compatibilityHelpText = isSpecificPart
    ? "Envianos una foto o el código del repuesto por WhatsApp."
    : "Envianos una foto de la etiqueta y del conector por WhatsApp.";
  const isOutOfStock = product.status === "Sin stock";
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    description: productDescription,
    image: product.images,
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    offers:
      product.price > 0
        ? {
            "@type": "Offer",
            priceCurrency: "ARS",
            price: product.price,
            availability:
              product.status === "Sin stock"
                ? "https://schema.org/OutOfStock"
                : "https://schema.org/InStock",
            url: `${siteConfig.baseUrl}/productos/${product.slug}`,
          }
        : undefined,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <section className="product-page shell">
        <nav className="breadcrumbs" aria-label="Migas de pan">
          <Link href="/">Inicio</Link>
          <ChevronRight />
          <Link href="/productos">Productos</Link>
          <ChevronRight />
          <span>{product.name}</span>
        </nav>
        <div className="product-detail-grid">
          <ProductGallery images={product.images} name={product.name} />
          <div className="product-info">
            <p className="eyebrow">{product.category}</p>
            <h1>{product.name}</h1>
            <div className="detail-price">
              {formatPrice(product.price)}
              {product.previousPrice && <del>{formatPrice(product.previousPrice)}</del>}
            </div>
            <div className="pills">
              <span>{product.condition}</span>
              <span className={`availability ${isOutOfStock ? "off" : ""}`}>
                <i aria-hidden="true" />
                {product.status}
              </span>
            </div>
            {needsCompatibilityHelp && (
              <div className="compatibility-warning">
                <strong>¿Necesitás confirmar compatibilidad?</strong>
                <p>{compatibilityHelpText}</p>
              </div>
            )}
            <ProductActions product={product} />
            <p className="confirmation-note">
              Precio, stock, forma de pago y envío sujetos a confirmación.
            </p>
            <div className="delivery-list">
              {product.shipping && (
                <span>
                  <Truck />
                  Disponible para envío
                </span>
              )}
              {product.pickup && (
                <span>
                  <MapPin />
                  Retiro en el local
                </span>
              )}
              <span>
                <ShieldCheck />
                {product.warranty || siteConfig.warrantyText}
              </span>
            </div>
            <p className="warranty-detail">{siteConfig.warrantyDetail}</p>
          </div>
        </div>

        {(productDescription || hasTechnicalData) && (
          <div
            className={`product-copy-grid ${
              productDescription && hasTechnicalData ? "" : "single"
            }`.trim()}
            data-reveal
          >
            {productDescription && (
              <section>
                <p className="eyebrow">Descripción</p>
                <h2>Lo que necesitás saber</h2>
                <p>{productDescription}</p>
              </section>
            )}
            {hasTechnicalData && (
              <section>
                <p className="eyebrow">Especificaciones</p>
                <dl>
                  {specifications.map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                  {product.board && (
                    <>
                      <div>
                        <dt>Código</dt>
                        <dd>{product.board.code}</dd>
                      </div>
                      <div>
                        <dt>Tipo</dt>
                        <dd>{product.board.type}</dd>
                      </div>
                    </>
                  )}
                </dl>
              </section>
            )}
          </div>
        )}

        {related.length > 0 && (
          <section className="related">
            <div className="section-heading" data-reveal>
              <div>
                <p className="eyebrow">También puede servirte</p>
                <h2>Productos relacionados</h2>
              </div>
            </div>
            <div className="product-grid">
              {related.map((item, index) => (
                <ProductCard
                  key={item.id}
                  product={item}
                  revealIndex={index}
                  sizes="(max-width: 390px) calc(100vw - 28px), (max-width: 1050px) calc(50vw - 32px), 25vw"
                />
              ))}
            </div>
          </section>
        )}
      </section>
    </>
  );
}
