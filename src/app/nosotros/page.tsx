import type { Metadata } from "next";
import {
  Check,
  MapPin,
  MessageCircle,
  PackageCheck,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";
import { HeroServiceCarousel } from "@/components/hero-service-carousel";
import { whatsappUrl } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Nosotros",
  description:
    "Conocé Chetech: tecnología, productos y servicio técnico con atención a domicilio en Río Tercero y alcance en toda Argentina.",
};

const serviceBenefits = [
  [
    MapPin,
    "Retiro y entrega sin costo",
    "Dentro de Río Tercero coordinamos el retiro y la entrega del equipo a domicilio, sin costo adicional.",
  ],
  [
    Wrench,
    "Diagnóstico sin costo",
    "Revisamos el equipo y te explicamos qué sucede antes de avanzar con cualquier reparación.",
  ],
  [
    Truck,
    "Alcance nacional",
    "Trabajamos con comisionistas y coordinamos envíos para atender consultas y pedidos desde distintos puntos del país.",
  ],
  [
    PackageCheck,
    "Productos de primera calidad",
    "Seleccionamos productos confiables, brindamos asesoramiento y realizamos envíos a toda la Argentina.",
  ],
] as const;

export default function AboutPage() {
  return (
    <>
      <section className="page-hero dark-grid">
        <div className="shell">
          <p className="kicker">Chetech / Río Tercero</p>
          <h1>
            Tecnología con
            <br />
            atención real.
          </h1>
          <p>
            Servicio técnico, productos seleccionados y una forma de trabajar pensada para que
            resolver sea más simple.
          </p>
        </div>
      </section>

      <section className="section shell about-grid about-intro">
        <HeroServiceCarousel intervalMs={3000} className="about-image" />
        <div className="about-copy">
          <p className="eyebrow">Nuestra forma de trabajar</p>
          <h2>Claridad antes, durante y después.</h2>
          <p>
            En Chetech combinamos servicio técnico y venta de tecnología con atención directa.
            Escuchamos lo que necesitás, revisamos cada caso y te explicamos las alternativas con
            claridad antes de avanzar.
          </p>
          <p>
            Nuestro principal objetivo es tu comodidad. Por eso buscamos estar disponibles en cada
            etapa: desde la primera consulta hasta la entrega del equipo o la recepción de tu
            compra.
          </p>
          <ul className="check-list">
            <li>
              <Check /> Retiro y entrega a domicilio sin costo en Río Tercero
            </li>
            <li>
              <Check /> Diagnóstico de reparaciones sin costo
            </li>
            <li>
              <Check /> Atención y seguimiento directo
            </li>
            <li>
              <Check /> Productos y reparaciones con garantía
            </li>
          </ul>
        </div>
      </section>

      <section className="section surface about-services">
        <div className="shell">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Más cerca, estés donde estés</p>
              <h2>Un servicio pensado alrededor tuyo.</h2>
            </div>
            <p>
              Reducimos vueltas, acercamos soluciones y mantenemos una comunicación clara durante
              todo el proceso.
            </p>
          </div>
          <div className="about-service-grid">
            {serviceBenefits.map(([Icon, title, text], index) => (
              <article key={title}>
                <div>
                  <Icon />
                  <span>0{index + 1}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="about-promise dark-grid">
        <div className="shell about-promise-grid">
          <div>
            <p className="kicker">Nuestro compromiso</p>
            <h2>Que resolver sea fácil.</h2>
            <p>
              Queremos que sientas que siempre hay alguien disponible para orientarte. Nos ocupamos
              de la coordinación, el seguimiento y la información para que vos puedas decidir con
              tranquilidad.
            </p>
          </div>
          <div className="about-promise-list">
            <article>
              <MessageCircle />
              <div>
                <strong>Respuesta directa</strong>
                <p>Hablás con nosotros, sin intermediarios innecesarios.</p>
              </div>
            </article>
            <article>
              <ShieldCheck />
              <div>
                <strong>Trabajo responsable</strong>
                <p>Cuidamos tus equipos y respaldamos nuestros productos y reparaciones.</p>
              </div>
            </article>
            <article>
              <Truck />
              <div>
                <strong>Soluciones que llegan</strong>
                <p>Coordinamos retiros, entregas, comisionistas y envíos según tu ubicación.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="section shell about-final">
        <p className="eyebrow">Estamos para ayudarte</p>
        <h2>Contanos qué necesitás.</h2>
        <p>
          Ya sea una reparación, una consulta o un producto, te ayudamos a encontrar la mejor
          alternativa y coordinamos la forma más cómoda de resolverlo.
        </p>
        <a
          className="button primary"
          href={whatsappUrl("Hola, Chetech. Quiero hacer una consulta.")}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle /> Hablar por WhatsApp
        </a>
      </section>
    </>
  );
}
