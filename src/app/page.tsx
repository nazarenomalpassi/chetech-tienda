import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";
import { ProductCard } from "@/components/store/product-card";
import { PointerField } from "@/components/store/pointer-field";
import { ScrollMotion } from "@/components/store/scroll-motion";
import { RepairStory } from "@/components/store/home/repair-story";
import { TvHero } from "@/components/store/home/tv-hero";
import { tvPowerScript } from "@/components/store/home/tv-power-script";
import { WaitlistForm } from "@/components/store/waitlist-form";
import { families, needs } from "@/config/catalog";
import { siteConfig } from "@/config/site";
import { getProducts } from "@/lib/catalog";
import { bestSellers } from "@/lib/catalog-query";
import { familySummaries, pickTvChannels } from "@/lib/home";
import { getStoreSettings } from "@/lib/store-settings";
import { whatsappUrl } from "@/lib/whatsapp";
import styles from "./home.module.css";

export const revalidate = 60;

export default async function HomePage() {
  const [products, settings] = await Promise.all([getProducts(), getStoreSettings()]);
  const channels = pickTvChannels(products, settings.promo.tvChannels);
  const top = bestSellers(products, 8);
  const summaries = familySummaries(products);
  const refurbished = products.filter((product) => product.condition === "Reacondicionado" && product.image);
  const { mercadopago, transfer, pickupPayment } = settings.payments;
  const onlinePayments = [
    mercadopago ? "Mercado Pago (tarjeta, débito o dinero en cuenta)" : null,
    transfer ? "transferencia" : null,
    pickupPayment ? "pago al retirar" : null,
  ].filter(Boolean);

  const faqs = [
    {
      q: "¿Puedo comprar sin crear una cuenta?",
      a: "Sí. Cargás tu nombre, tu mail y tu WhatsApp, y listo. La cuenta es opcional y sirve para seguir pedidos y reparaciones.",
    },
    {
      q: "¿Cuándo puedo retirar?",
      a: `En ${siteConfig.address}, Río Tercero. Lunes a viernes de 09:30 a 19:00 y sábados de 10:00 a 12:30 y de 16:00 a 20:00.`,
    },
    {
      q: "¿Qué garantía tienen los productos?",
      a: "Cada ficha dice el plazo de garantía. Nunca es menor al que fija la ley: 6 meses para productos nuevos y 3 para usados o reacondicionados.",
    },
    {
      q: "¿Cómo pago?",
      a: onlinePayments.length
        ? `Online podés pagar con ${onlinePayments.join(", ")}. En el local, con efectivo, transferencia, Mercado Pago o Naranja X.`
        : "Elegís los productos acá, nos mandás el pedido por WhatsApp y pagás al retirar: efectivo, transferencia, Mercado Pago o Naranja X.",
    },
    {
      q: "¿Hacen envíos?",
      a: settings.delivery.correo
        ? "Sí, por Correo Argentino a todo el país. El costo se calcula en el carrito antes de pagar."
        : "Por ahora los pedidos se retiran en el local. Si necesitás que te lo llevemos, escribinos por WhatsApp.",
    },
    {
      q: "¿Me puedo arrepentir de una compra?",
      a: "Sí. Tenés 10 días corridos desde que recibís el producto. Usá el botón de arrepentimiento que está al pie de la página; no hace falta registrarse.",
    },
  ];

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: tvPowerScript }} />
      <TvHero
        channels={channels}
        title={
          <h1 id="hero-titulo" className={styles.title}>
            Arreglamos tu tele. <span>Y tenemos todo para que la disfrutes.</span>
          </h1>
        }
      >
        <ul className={styles.proofs}>
          <li>
            <span>
              <strong>Lo retirás hoy</strong> en {siteConfig.address}, sin costo.
            </span>
          </li>
          <li>
            <span>
              <strong>Garantía escrita</strong> en cada producto, con plazo en meses.
            </span>
          </li>
          <li>
            <span>
              <strong>Lo prueba un técnico:</strong> lo del taller sale revisado.
            </span>
          </li>
        </ul>
        <div className={styles.heroActions}>
          <Link href="/productos" className="btn" data-size="large">
            Ver productos
          </Link>
          <Link href="/servicio-tecnico" className="btn" data-variant="secondary" data-size="large">
            Reparar un equipo
          </Link>
        </div>
      </TvHero>

      <ScrollMotion>
      {/* Marquesina con los rubros de la tarjeta del local. Es decorativa: el texto se lee una vez. */}
      <div className={styles.ticker}>
        <p className="visually-hidden">Reparamos televisores, computadoras, electrodomésticos y más.</p>
        <div className={styles.tickerTrack} data-anim="marquesina" aria-hidden>
          {[0, 1, 2, 3].map((copy) => (
            <ul key={copy}>
              {["Reparamos", "Televisores", "Computadoras", "Electrodomésticos", "Y más"].map((word) => (
                <li key={word}>{word}</li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      <section className={`oscuro ${styles.section}`} data-tono="grafito" aria-labelledby="necesidades-titulo">
        <div className="page">
          <h2 id="necesidades-titulo" className={styles.sectionTitle} data-anim="titulo">
            ¿Qué necesitás?
          </h2>
          <PointerField>
<ul className={styles.needs} data-anim="grupo">
            {needs.map((need) => (
              <li key={need.slug}>
                <Link href={need.href ?? `/productos?necesidad=${need.slug}`} className={styles.need} data-cursor>
                  <span className={styles.needLabel}>{need.label}</span>
                  <span className={styles.needHint}>{need.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
</PointerField>
        </div>
      </section>

      {top.length ? (
        <section className={styles.section} aria-labelledby="vendidos-titulo">
          <div className="page">
            <div className={styles.sectionHead}>
              <h2 id="vendidos-titulo" className={styles.sectionTitle} data-anim="titulo">
                Lo más vendido en el local
              </h2>
              <Link href="/productos" className="enlace">
                Ver todo
              </Link>
            </div>
            <div className={styles.grid}>
              {top.map((product, index) => (
                <ProductCard key={product.id} product={product} index={index} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className={`oscuro ${styles.section}`} aria-labelledby="familias-titulo">
        <div className="page">
          <h2 id="familias-titulo" className={styles.sectionTitle} data-anim="titulo">
            Toda la pared del local
          </h2>
          <PointerField>
<ul className={styles.wall} data-anim="grupo">
            {families
              .filter((family) => (summaries.get(family.slug)?.count ?? 0) > 0)
              .map((family) => {
                const summary = summaries.get(family.slug);
                return (
                  <li key={family.slug}>
                    <Link href={`/productos?familia=${family.slug}`} className={styles.family} data-cursor>
                      <span className={styles.familyImages} aria-hidden>
                        {summary?.images.map((image) => (
                          <span key={image}>
                            <Image src={image} alt="" fill sizes="120px" />
                          </span>
                        ))}
                      </span>
                      <span className={styles.familyText}>
                        <strong>{family.name}</strong>
                        <span>{family.description}</span>
                        <span className={styles.familyCount}>
                          <span data-count={summary?.count}>{summary?.count}</span>{" "}
                          {summary?.count === 1 ? "producto" : "productos"}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
</PointerField>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="del-taller-titulo">
        <div className={`page ${styles.workshop}`} data-anim="grupo">
          <div className={styles.workshopCard}>
            <h2 id="del-taller-titulo">Teles revisadas del taller</h2>
            {refurbished.length ? (
              <>
                <p>Cada una sale con su lista de pruebas, garantía y fotos reales.</p>
                <div className={styles.workshopGrid}>
                  {refurbished.slice(0, 2).map((product, index) => (
                    <ProductCard key={product.id} product={product} index={index} />
                  ))}
                </div>
                <Link href="/reacondicionados" className="btn" data-variant="secondary">
                  Ver todas las teles revisadas
                </Link>
              </>
            ) : (
              <>
                <p>
                  Ahora no hay teles revisadas a la venta. Cuando entre una, probada en el banco de pruebas y con
                  garantía, te avisamos.
                </p>
                <WaitlistForm kind="refurbished" cta="Avisarme cuando entre una" />
              </>
            )}
          </div>

          <div className={styles.workshopCard}>
            <h2>Buscá la placa de tu tele</h2>
            <p>
              Escribí el modelo de tu televisor o el código de la placa. Está en la etiqueta de atrás de la tele o
              impreso sobre la placa.
            </p>
            <form action="/placas-tv" method="get" className={styles.boardForm} role="search">
              <label className="field">
                <span>Modelo o código</span>
                <input name="modelo" placeholder="Por ejemplo, 32LJ600B o BN41-02568" autoComplete="off" required minLength={3} />
              </label>
              <button type="submit" className="btn">
                <Search aria-hidden size={18} />
                Buscar placa
              </button>
            </form>
            <p className={styles.small}>
              Si no aparece,{" "}
              <a className="enlace" href={whatsappUrl("Hola, busco una placa para mi tele. Les mando una foto de la etiqueta.")} target="_blank" rel="noreferrer">
                mandanos una foto de la etiqueta por WhatsApp
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      <RepairStory
        actions={
          <>
            <Link href="/cuenta/reparaciones" className="btn">
              Seguí tu reparación
            </Link>
            <a
              href={whatsappUrl("Hola, quiero pedir un presupuesto para reparar un equipo.")}
              target="_blank"
              rel="noreferrer"
              className="btn"
              data-variant="secondary"
            >
              Pedir presupuesto
            </a>
          </>
        }
      />

      <section className={styles.section} aria-labelledby="local-titulo">
        <div className={`page ${styles.trust}`}>
          <div className={styles.trustIntro}>
            <h2 id="local-titulo" className={styles.sectionTitle} data-anim="titulo">
              Un local de verdad, en Río Tercero
            </h2>
            <p>
              Estamos en {siteConfig.address}. Podés venir a ver los productos, retirar tu compra o dejar un equipo
              para reparar.
            </p>
            <div className={styles.trustActions}>
              <a href={siteConfig.mapsUrl} target="_blank" rel="noreferrer" className="btn" data-variant="secondary">
                Cómo llegar
              </a>
              <a href={siteConfig.instagram} target="_blank" rel="noreferrer" className="btn" data-variant="quiet">
                Ver el Instagram
              </a>
            </div>
          </div>
          <dl className={styles.facts} data-anim="grupo">
            <div>
              <dt>Horario</dt>
              <dd>
                Lunes a viernes de 09:30 a 19:00
                <br />
                Sábados de 10:00 a 12:30 y de 16:00 a 20:00
              </dd>
            </div>
            <div>
              <dt>Pagos en el local</dt>
              <dd>Efectivo, transferencia, Mercado Pago o Naranja X</dd>
            </div>
            <div>
              <dt>Pagos online</dt>
              <dd>{onlinePayments.length ? onlinePayments.join(", ") : "Reservás por WhatsApp y pagás al retirar"}</dd>
            </div>
            <div>
              <dt>Factura</dt>
              <dd>
                {siteConfig.invoiceType}. CUIT {siteConfig.taxId}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className={`oscuro ${styles.section} ${styles.sectionLast}`} data-tono="grafito" aria-labelledby="preguntas-titulo">
        <div className={`page ${styles.faq}`}>
          <h2 id="preguntas-titulo" className={styles.sectionTitle} data-anim="titulo">
            Preguntas frecuentes
          </h2>
          <div className={styles.faqList} data-anim="grupo">
            {faqs.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      </ScrollMotion>
    </>
  );
}
