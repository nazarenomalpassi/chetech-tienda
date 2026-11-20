import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Check,
  CircuitBoard,
  Clock3,
  Cpu,
  Gamepad2,
  Gauge,
  MapPin,
  MessageCircle,
  Monitor,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tv,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { ServiceAccordion, type ServiceAccordionItem } from "@/components/service-accordion";
import { ServiceRepairsCta } from "@/components/service-repairs-cta";
import { RepairStory } from "@/components/store/home/repair-story";
import { PointerField } from "@/components/store/pointer-field";
import { ScrollMotion } from "@/components/store/scroll-motion";
import {
  generalServiceFaqs,
  getServiceCategory,
  serviceCategories,
  serviceLandingHero,
  serviceProcess,
  type ServiceCategory,
  type ServiceFaq,
  type ServiceIconKey,
} from "@/config/service-categories";
import { siteConfig } from "@/config/site";
import { whatsappUrl } from "@/lib/whatsapp";

const serviceIcons: Record<ServiceIconKey, LucideIcon> = {
  monitor: Monitor,
  tv: Tv,
  smartphone: Smartphone,
  gamepad: Gamepad2,
  cpu: Cpu,
  wrench: Wrench,
};

function ServiceIcon({ iconKey }: { iconKey: ServiceIconKey }) {
  const Icon = serviceIcons[iconKey];
  return <Icon aria-hidden="true" />;
}

// El movimiento de estas páginas es el mismo del resto de la tienda (ver ScrollMotion): los títulos
// marcados con data-anim="titulo" suben renglón por renglón, los grupos entran en cascada y los bloques
// sueltos suben enteros. Las tarjetas con data-cursor llevan una luz que acompaña al mouse.

function ServiceCategoryRail({ activeSlug }: { activeSlug?: ServiceCategory["slug"] }) {
  return (
    <nav className="service-tech-rail" aria-label="Categorías de servicio técnico">
      <div className="service-tech-shell">
        <Link
          className={!activeSlug ? "is-active" : undefined}
          aria-current={!activeSlug ? "page" : undefined}
          href="/servicio-tecnico"
        >
          Todos
        </Link>
        {serviceCategories.map((category) => (
          <Link
            className={activeSlug === category.slug ? "is-active" : undefined}
            aria-current={activeSlug === category.slug ? "page" : undefined}
            href={category.href}
            key={category.slug}
          >
            {category.shortTitle}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function LandingHero() {
  return (
    <section
      className="service-tech-hero service-tech-hero--landing"
      aria-labelledby="service-title"
    >
      <div className="service-tech-lab-layout service-tech-shell">
        <header className="service-tech-lab-heading">
          <p className="service-tech-kicker">Servicio técnico · Río Tercero</p>
          <h1 id="service-title">
            <span>Tecnología</span>
            <span>en diagnóstico.</span>
          </h1>
        </header>

        <div
          className="service-tech-lab-workbench"
          role="group"
          aria-label="Banco de diagnóstico técnico"
        >
          <Image
            src={serviceLandingHero.image}
            fill
            priority
            sizes="(max-width: 900px) 94vw, 68vw"
            alt={serviceLandingHero.imageAlt}
          />
          <span className="service-tech-scanline" aria-hidden="true" />
          <ul className="service-tech-lab-tags" aria-label="Áreas técnicas que evaluamos">
            {serviceLandingHero.specialisms.map((specialism) => (
              <li key={specialism}>{specialism}</li>
            ))}
          </ul>
        </div>

        <aside className="service-tech-lab-panel" aria-label="Información y acciones del servicio">
          <div>
            <p className="service-tech-eyebrow">Precisión antes de avanzar</p>
            <h2>Primero revisamos. Después reparamos.</h2>
            <p>
              Computadoras, televisores, celulares, consolas y otros equipos electrónicos reciben un
              diagnóstico claro antes de definir el trabajo.
            </p>
          </div>
          <div className="service-tech-lab-actions">
            <a
              className="button whatsapp"
              href={whatsappUrl(
                "Hola, Chetech. Quiero consultar por una reparación. El equipo es: ____ y la falla es: ____.",
              )}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle aria-hidden="true" />
              Consultar reparación
            </a>
            <a className="button ghost" href="#servicios">
              Ver servicios
              <ArrowDown aria-hidden="true" />
            </a>
          </div>
          <div className="service-tech-lab-account">
            <ServiceRepairsCta />
          </div>
          <ul
            className="service-tech-hero-facts service-tech-lab-facts"
            aria-label="Beneficios del servicio"
          >
            <li>
              <CircuitBoard aria-hidden="true" />
              Diagnóstico sin costo
            </li>
            <li>
              <MapPin aria-hidden="true" />
              Retiro coordinado en Río Tercero
            </li>
            <li>
              <ShieldCheck aria-hidden="true" />
              Seguimiento privado
            </li>
          </ul>
        </aside>
      </div>
    </section>
  );
}

function ServiceCategoryGrid() {
  return (
    <section className="service-tech-section service-tech-categories" id="servicios">
      <PointerField className="service-tech-shell">
        <div className="service-tech-heading">
          <div>
            <p className="service-tech-eyebrow">Elegí el tipo de equipo</p>
            <h2 data-anim="titulo">Un servicio para cada tecnología.</h2>
          </div>
          <p data-anim="bloque">
            Ingresá a cada categoría para conocer soluciones, fallas frecuentes y la forma de
            trabajo. Si no encontrás tu equipo, también podemos evaluarlo.
          </p>
        </div>
        <div className="service-tech-category-grid" data-anim="grupo">
          {serviceCategories.map((category, index) => (
            <Link
              className="service-tech-card"
              href={category.href}
              key={category.slug}
              data-cursor
            >
              <span className="service-tech-card-media">
                <Image
                  src={category.image}
                  fill
                  priority={index === 0}
                  sizes="(max-width: 720px) 94vw, (max-width: 1100px) 46vw, 31vw"
                  alt={category.imageAlt}
                />
                <span className="service-tech-card-scan" aria-hidden="true" />
              </span>
              <span className="service-tech-card-body">
                <span className="service-tech-card-meta">
                  <ServiceIcon iconKey={category.iconKey} />
                </span>
                <strong>{category.title}</strong>
                <span className="service-tech-card-description">{category.cardDescription}</span>
                <span className="service-tech-card-link">
                  Ver servicios
                  <ArrowRight aria-hidden="true" />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </PointerField>
    </section>
  );
}

function ServiceTrust() {
  const items = [
    {
      icon: CircuitBoard,
      title: "Diagnóstico sin costo",
      text: "Revisamos el equipo para definir la falla y la viabilidad antes de prometer una solución.",
    },
    {
      icon: MapPin,
      title: "Comodidad local",
      text: "Coordinamos retiro y entrega sin costo dentro de Río Tercero según cobertura.",
    },
    {
      icon: Clock3,
      title: "Información clara",
      text: "Te comunicamos el presupuesto y los próximos pasos antes de realizar el trabajo.",
    },
    {
      icon: ShieldCheck,
      title: "Seguimiento y garantía",
      text: "Las órdenes vinculadas pueden seguirse desde tu cuenta y cada trabajo informa sus condiciones.",
    },
  ];

  return (
    <section className="service-tech-trust" aria-labelledby="service-trust-title">
      <PointerField className="service-tech-shell">
        <div className="service-tech-heading service-tech-heading--dark">
          <div>
            <p className="service-tech-eyebrow">Servicio pensado para vos</p>
            <h2 id="service-trust-title" data-anim="titulo">
              Tecnología con trato directo.
            </h2>
          </div>
          <p data-anim="bloque">
            Nuestro objetivo es que entiendas qué pasa con tu equipo y puedas decidir con
            información concreta.
          </p>
        </div>
        <div className="service-tech-trust-grid" data-anim="grupo">
          {items.map(({ icon: Icon, title, text }) => (
            <article key={title} data-cursor>
              <Icon aria-hidden="true" />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </PointerField>
    </section>
  );
}

function RepairProcess({ compact = false }: { compact?: boolean }) {
  const items: ServiceAccordionItem[] = serviceProcess.map((step) => ({
    id: step.index,
    eyebrow: step.index,
    title: step.title,
    summary: step.summary,
    details: step.details,
  }));

  return (
    <section
      className={`service-tech-section service-tech-process ${compact ? "service-tech-process--compact" : ""}`}
      id="proceso"
      aria-labelledby={compact ? "detail-process-title" : "service-process-title"}
    >
      <div className="service-tech-shell">
        <div className="service-tech-process-layout">
          <div className="service-tech-process-intro">
            <p className="service-tech-eyebrow">Cómo trabajamos</p>
            <h2 id={compact ? "detail-process-title" : "service-process-title"} data-anim="titulo">
              Un proceso claro, de la consulta a la entrega.
            </h2>
            <p data-anim="bloque">
              Abrí cada etapa para conocer qué registramos, cuándo presupuestamos y cómo podés
              seguir la reparación.
            </p>
          </div>
          <ServiceAccordion
            ariaLabel="Etapas de nuestro proceso de reparación"
            idPrefix={compact ? "detail-process" : "service-process"}
            initialOpen={0}
            items={items}
            variant="process"
          />
        </div>
      </div>
    </section>
  );
}

function ServiceFaq({
  items,
  idPrefix,
  title = "Respuestas antes de traer tu equipo.",
}: {
  items: readonly ServiceFaq[];
  idPrefix: string;
  title?: string;
}) {
  const accordionItems: ServiceAccordionItem[] = items.map((item, index) => ({
    id: String(index + 1).padStart(2, "0"),
    title: item.question,
    details: [item.answer],
  }));

  return (
    <section className="service-tech-section service-tech-faq" id="preguntas">
      <div className="service-tech-shell service-tech-faq-layout">
        <div>
          <p className="service-tech-eyebrow">Preguntas frecuentes</p>
          <h2 data-anim="titulo">{title}</h2>
          <p data-anim="bloque">
            Cada reparación depende del equipo y de la falla. Estas respuestas explican el criterio
            general sin reemplazar el diagnóstico.
          </p>
          <Link className="service-tech-inline-link" href="/preguntas-frecuentes-legales">
            Ver información general
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <ServiceAccordion
          ariaLabel="Preguntas frecuentes sobre servicio técnico"
          idPrefix={idPrefix}
          items={accordionItems}
        />
      </div>
    </section>
  );
}

function ServiceCta({ category }: { category?: ServiceCategory }) {
  const message =
    category?.contextualWhatsAppMessage ??
    "Hola, Chetech. Quiero consultar por una reparación. El equipo es: ____ y la falla es: ____.";

  return (
    <section className="service-tech-cta">
      <div className="service-tech-shell service-tech-cta-inner">
        <div>
          <p className="service-tech-eyebrow">Contanos qué falla</p>
          <h2 data-anim="titulo">
            {category
              ? `Consultá por ${category.shortTitle.toLowerCase()}.`
              : "Empecemos por tu equipo."}
          </h2>
          <p>
            Enviá el tipo de equipo, marca, modelo y una descripción de la falla. La consulta
            inicial sirve para orientarte y coordinar el diagnóstico.
          </p>
        </div>
        <div className="service-tech-cta-actions" data-anim="bloque">
          <a
            className="button whatsapp"
            href={whatsappUrl(message)}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle aria-hidden="true" />
            Hablar por WhatsApp
          </a>
          <Link className="button ghost" href="/contacto">
            <MapPin aria-hidden="true" />
            Traer mi equipo
          </Link>
        </div>
      </div>
    </section>
  );
}

function DetailHero({ category }: { category: ServiceCategory }) {
  return (
    <section className="service-tech-hero service-tech-hero--detail" aria-labelledby="detail-title">
      <div className="service-tech-shell">
        <nav className="service-tech-breadcrumb" aria-label="Migas de pan">
          <Link href="/">Inicio</Link>
          <span aria-hidden="true">/</span>
          <Link href="/servicio-tecnico">Servicio técnico</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{category.shortTitle}</span>
        </nav>
        <div className="service-tech-detail-hero-grid">
          <div className="service-tech-hero-copy">
            <p className="service-tech-kicker">{category.kicker}</p>
            <h1 id="detail-title">{category.title}</h1>
            <p className="service-tech-hero-lead">{category.summary}</p>
            <div className="service-tech-actions">
              <a
                className="button whatsapp"
                href={whatsappUrl(category.contextualWhatsAppMessage)}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle aria-hidden="true" />
                Consultar este servicio
              </a>
              <a className="button ghost" href="#soluciones">
                Ver soluciones
                <ArrowDown aria-hidden="true" />
              </a>
            </div>
          </div>
          <div className="service-tech-detail-visual">
            <Image
              src={category.image}
              fill
              priority
              sizes="(max-width: 900px) 94vw, 44vw"
              alt={category.imageAlt}
            />
            <span className="service-tech-scanline" aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ServiceSolutions({ category }: { category: ServiceCategory }) {
  return (
    <section className="service-tech-section service-tech-solutions" id="soluciones">
      <PointerField className="service-tech-shell">
        <div className="service-tech-heading">
          <div>
            <p className="service-tech-eyebrow">Qué podemos revisar</p>
            <h2 data-anim="titulo">Soluciones organizadas por necesidad.</h2>
          </div>
          <p data-anim="bloque">{category.description}</p>
        </div>
        <div className="service-tech-solution-grid" data-anim="grupo">
          {category.serviceGroups.map((group) => (
            <article key={group.title} data-cursor>
              <CircuitBoard aria-hidden="true" />
              <h3>{group.title}</h3>
              <p>{group.summary}</p>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>
                    <Check aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </PointerField>
    </section>
  );
}

function CommonProblems({ category }: { category: ServiceCategory }) {
  return (
    <section className="service-tech-diagnostics" id="fallas">
      <div className="service-tech-shell">
        <div className="service-tech-diagnostics-grid">
          <div>
            <p className="service-tech-eyebrow">Fallas frecuentes</p>
            <h2 data-anim="titulo">Señales que conviene revisar.</h2>
            <p data-anim="bloque">
              Un mismo síntoma puede tener causas distintas. Por eso usamos estas señales como punto
              de partida y confirmamos la solución después del diagnóstico.
            </p>
            <ul className="service-tech-problem-list" data-anim="grupo">
              {category.commonProblems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
          <aside className="service-tech-diagnostic-panel" data-anim="bloque">
            <div>
              <Gauge aria-hidden="true" />
              <p className="service-tech-eyebrow">Criterio técnico</p>
              <h3>Primero evaluar. Después avanzar.</h3>
            </div>
            {category.benefits && (
              <ul className="service-tech-benefits" aria-label="Beneficios posibles">
                {category.benefits.map((benefit) => (
                  <li key={benefit}>
                    <Sparkles aria-hidden="true" />
                    {benefit}
                  </li>
                ))}
              </ul>
            )}
            <div className="service-tech-notices">
              {category.notices.map((notice) => (
                <p key={notice}>{notice}</p>
              ))}
            </div>
            <Link className="service-tech-warranty-link" href="/garantias">
              <ShieldCheck aria-hidden="true" />
              <span>
                <strong>{siteConfig.warrantyText}</strong>
                <small>{siteConfig.warrantyDetail}</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </div>
    </section>
  );
}

function RelatedServices({ category }: { category: ServiceCategory }) {
  const related = category.relatedSlugs
    .map((slug) => getServiceCategory(slug))
    .filter((item): item is ServiceCategory => Boolean(item));

  return (
    <section className="service-tech-section service-tech-related" aria-labelledby="related-title">
      <div className="service-tech-shell">
        <div className="service-tech-heading">
          <div>
            <p className="service-tech-eyebrow">También puede servirte</p>
            <h2 id="related-title" data-anim="titulo">
              Servicios relacionados.
            </h2>
          </div>
          <Link className="service-tech-inline-link" href="/servicio-tecnico">
            Ver todas las categorías
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <div className="service-tech-related-grid" data-anim="grupo">
          {related.map((item) => (
            <Link href={item.href} key={item.slug}>
              <span>
                <Image
                  src={item.image}
                  fill
                  sizes="(max-width: 720px) 94vw, 31vw"
                  alt={item.imageAlt}
                />
              </span>
              <div>
                <ServiceIcon iconKey={item.iconKey} />
                <strong>{item.title}</strong>
                <ArrowRight aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ServiceLanding() {
  return (
    <ScrollMotion>
      <LandingHero />
      <ServiceCategoryRail />
      <ServiceCategoryGrid />
      <ServiceTrust />
      {/* E3 · De rota a reparada: el mismo tramo de la portada, antes del detalle de cada etapa. El
          televisor queda fijo debajo del encabezado y de la barra de categorías. */}
      <RepairStory
        container="service-tech-shell"
        pinOffset="var(--service-rail-height)"
        lead="Así pasa un equipo por el taller. No arreglamos nada sin tu visto bueno y te avisamos cuando está listo."
        actions={
          <>
            <a
              className="btn"
              href={whatsappUrl(
                "Hola, Chetech. Quiero pedir un presupuesto. El equipo es: ____ y la falla es: ____.",
              )}
              target="_blank"
              rel="noreferrer"
            >
              Pedir presupuesto
            </a>
            <Link className="btn" data-variant="secondary" href="/cuenta/reparaciones">
              Seguí tu reparación
            </Link>
          </>
        }
      />
      <RepairProcess />
      <ServiceFaq items={generalServiceFaqs} idPrefix="service-general-faq" />
      <ServiceCta />
    </ScrollMotion>
  );
}

export function ServiceDetailLayout({ category }: { category: ServiceCategory }) {
  const faqItems = [...category.faqs, ...generalServiceFaqs.slice(0, 5)];

  return (
    <ScrollMotion signature={category.slug}>
      <DetailHero category={category} />
      <ServiceCategoryRail activeSlug={category.slug} />
      <nav className="service-tech-local-nav" aria-label={`Contenido de ${category.title}`}>
        <div className="service-tech-shell">
          <a href="#soluciones">Soluciones</a>
          <a href="#fallas">Fallas frecuentes</a>
          <a href="#proceso">Proceso</a>
          <a href="#preguntas">Preguntas</a>
        </div>
      </nav>
      <ServiceSolutions category={category} />
      <CommonProblems category={category} />
      <RepairProcess compact />
      <ServiceFaq
        items={faqItems}
        idPrefix={`service-${category.slug}-faq`}
        title={`Lo importante sobre ${category.shortTitle.toLowerCase()}.`}
      />
      <RelatedServices category={category} />
      <ServiceCta category={category} />
    </ScrollMotion>
  );
}
