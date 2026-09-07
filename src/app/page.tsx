import Link from "next/link";
import type { CSSProperties } from "react";
import {
  ArrowRight,
  Box,
  MapPin,
  MessageCircle,
  PackageCheck,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";
import { CategoryShowcase } from "@/components/category-showcase";
import { HeroServiceCarousel } from "@/components/hero-service-carousel";
import { ProductCarousel } from "@/components/product-carousel";
import { getCatalog, selectHomeProducts } from "@/lib/catalog";
import { siteConfig } from "@/config/site";
import { whatsappUrl } from "@/lib/whatsapp";

export const revalidate = 60;

export default async function Home() {
  const catalog = await getCatalog({ pageSize: 48 });
  const products = selectHomeProducts(catalog.products, 12);
  return (
    <>
      <section className="hero dark-grid">
        <div className="shell hero-grid">
          <div className="hero-copy" data-reveal="left">
            <p className="kicker">Tecnología · Reparación · Río Tercero</p>
            <h1>
              Tecnología que
              <br />
              <span>responde.</span>
            </h1>
            <p>Encontrá tecnología, accesorios, repuestos y equipos seleccionados por Chetech.</p>
            <div className="hero-actions">
              <Link href="/productos" className="button light">
                Explorar productos <ArrowRight />
              </Link>
              <a
                className="button ghost"
                href={whatsappUrl("Hola, Chetech. Quiero hacer una consulta.")}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle /> Hablar por WhatsApp
              </a>
            </div>
          </div>
          <div className="hero-visual" data-reveal="right">
            <HeroServiceCarousel />
          </div>
        </div>
      </section>

      {catalog.categories.length > 0 && <CategoryShowcase categories={catalog.categories} />}

      {products.length > 0 && (
        <section className="section surface">
          <div className="shell">
            <div className="section-heading" data-reveal>
              <div>
                <p className="eyebrow">Selección Chetech</p>
                <h2>Explorá nuestros productos</h2>
              </div>
              <Link className="text-link" href="/productos">
                Ver todos los productos <ArrowRight />
              </Link>
            </div>
            <ProductCarousel products={products} />
          </div>
        </section>
      )}

      <section className="board-spotlight dark-grid">
        <div className="shell board-grid">
          <div data-reveal="left">
            <p className="kicker">Placas de televisores</p>
            <h2>
              Buscá por modelo.
              <br />
              Confirmá con nosotros.
            </h2>
            <p>
              Buscá el modelo exacto de tu televisor. También podés enviarnos una foto de la
              etiqueta o de la placa por WhatsApp para verificar compatibilidad.
            </p>
            <Link href="/placas-tv" className="button light">
              Buscar mi placa <ArrowRight />
            </Link>
          </div>
          <div className="board-code" data-reveal="right">
            <strong>32PHG5102</strong>
            <small>MODELO DE TV / CONSULTÁ COMPATIBILIDAD</small>
          </div>
        </div>
      </section>

      <section className="section shell">
        <div className="section-heading" data-reveal>
          <div>
            <p className="eyebrow">Servicio técnico especializado</p>
            <h2>Reparamos. Probamos. Explicamos.</h2>
          </div>
          <Link className="text-link" href="/servicio-tecnico">
            Ver servicios <ArrowRight />
          </Link>
        </div>
        <div className="service-grid">
          {[
            [
              Wrench,
              "Diagnóstico técnico",
              "Revisamos el equipo y te explicamos el problema antes de avanzar.",
            ],
            [PackageCheck, "Trabajo documentado", "Presupuesto y estado comunicados con claridad."],
            [Box, "Retiro y entrega", "Coordinamos la modalidad disponible para tu zona."],
          ].map(([Icon, title, text], index) => {
            const I = Icon as typeof Wrench;
            return (
              <article
                key={String(title)}
                data-reveal
                style={{ "--reveal-delay": `${index * 70}ms` } as CSSProperties}
              >
                <I />
                <span>{"///"}</span>
                <h3>{String(title)}</h3>
                <p>{String(text)}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="trust-strip" data-reveal>
        <div className="shell">
          <span>
            <ShieldCheck /> {siteConfig.warrantyText}
          </span>
          <span>
            <Truck /> Envíos a toda Argentina
          </span>
          <span>
            <MapPin /> Retiro en Río Tercero
          </span>
        </div>
      </section>

      <section className="section shell visit-grid">
        <div data-reveal="left">
          <p className="eyebrow">Visitanos</p>
          <h2>{siteConfig.address}</h2>
          <p>{siteConfig.location}</p>
          <a className="button primary" href={siteConfig.mapsUrl} target="_blank" rel="noreferrer">
            Cómo llegar <ArrowRight />
          </a>
        </div>
        <div className="hours-card" data-reveal="right">
          <p className="eyebrow">Horarios de atención</p>
          <dl className="hours-list">
            {siteConfig.businessHours.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section surface">
        <div className="shell faq-layout">
          <div data-reveal="left">
            <p className="eyebrow">Preguntas frecuentes</p>
            <h2>Comprar simple, sin vueltas.</h2>
            <p>
              Armá tu carrito y envianos el pedido por WhatsApp. Te confirmaremos disponibilidad,
              forma de pago y envío.
            </p>
          </div>
          <div className="faq-list" data-reveal="right">
            {[
              [
                "¿Cómo compro?",
                "Agregá productos al carrito, ingresá o creá tu cuenta y generá el pedido. Te llevamos a WhatsApp para terminar de coordinarlo.",
              ],
              [
                "¿Los productos y reparaciones tienen garantía?",
                `${siteConfig.warrantyText} ${siteConfig.warrantyDetail}`,
              ],
              [
                "¿Cómo confirmo una placa?",
                "Enviá una foto clara del código y los conectores. Comparamos los datos antes de coordinar la compra.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <span>+</span>
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <section className="consumer-rights">
        <div className="shell">
          <div>
            <p className="eyebrow">Compras remotas</p>
            <h2>¿Necesitás cancelar una compra?</h2>
            <p>Podés iniciar el trámite sin cuenta, contraseña ni motivo obligatorio.</p>
          </div>
          <Link className="button light" href="/arrepentimiento">
            Botón de arrepentimiento <ArrowRight />
          </Link>
        </div>
      </section>
    </>
  );
}
