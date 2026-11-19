import type { Metadata } from "next";
import { MapPin, MessageCircle, PackageCheck, ShieldCheck, Truck, Wrench } from "lucide-react";
import { HeroServiceCarousel } from "@/components/hero-service-carousel";
import { siteConfig } from "@/config/site";
import { whatsappUrl } from "@/lib/whatsapp";
import styles from "./about.module.css";

export const metadata: Metadata = {
  title: "Nosotros",
  description:
    "CheTech: servicio técnico y tienda de tecnología en Río Tercero, con retiro y entrega a domicilio en la ciudad y envíos a todo el país.",
  alternates: { canonical: "/nosotros" },
};

const howWeWork = [
  {
    icon: Wrench,
    title: "Diagnóstico sin costo",
    text: "Revisamos el equipo y te explicamos qué tiene y cuánto sale antes de tocar nada.",
  },
  {
    icon: MapPin,
    title: "Retiro y entrega en Río Tercero",
    text: "Dentro de la ciudad buscamos el equipo y te lo devolvemos en tu casa, sin costo.",
  },
  {
    icon: Truck,
    title: "Envíos a todo el país",
    text: "Despachamos compras y coordinamos con comisionistas para atender reparaciones de otras ciudades.",
  },
  {
    icon: PackageCheck,
    title: "Productos confiables",
    text: "Elegimos lo que vendemos y te asesoramos antes de comprar.",
  },
];

const promises = [
  { icon: MessageCircle, title: "Hablás con nosotros", text: "Sin intermediarios: hablás directo con el local." },
  { icon: ShieldCheck, title: "Respaldamos lo que hacemos", text: "Cuidamos tus equipos, y los productos y reparaciones tienen garantía." },
  { icon: Truck, title: "Nos ocupamos de la logística", text: "Retiros, entregas, comisionistas y envíos según dónde estés." },
];

export default function AboutPage() {
  return (
    <>
      <section className={`page ${styles.intro}`}>
        <div className={styles.introText}>
          <h1>Tecnología con atención real</h1>
          <p>
            En CheTech reparamos y vendemos tecnología en Río Tercero. Escuchamos lo que necesitás, revisamos cada caso
            y te explicamos las opciones con claridad antes de avanzar.
          </p>
          <p>
            Queremos que resolver sea simple: estar disponibles desde la primera consulta hasta que tenés el equipo o la
            compra en la mano.
          </p>
        </div>
        <HeroServiceCarousel intervalMs={4000} />
      </section>

      <section className={`page ${styles.how}`} aria-labelledby="como-trabajamos">
        <div className={styles.howHead}>
          <h2 id="como-trabajamos">Cómo trabajamos</h2>
          <p>Menos vueltas para vos: nos encargamos de coordinar y de avisarte en cada paso.</p>
        </div>
        <ul className={styles.list}>
          {howWeWork.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Icon aria-hidden />
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.promise} aria-labelledby="compromiso">
        <div className={`page ${styles.promiseInner}`}>
          <div className={styles.promiseText}>
            <h2 id="compromiso">Que resolver sea fácil</h2>
            <p>
              Siempre hay alguien para orientarte. Nos ocupamos de la coordinación, el seguimiento y la información para
              que decidas con tranquilidad.
            </p>
          </div>
          <ul className={styles.list}>
            {promises.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <Icon aria-hidden />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={`page ${styles.visit}`} aria-labelledby="visitanos">
        <div className={styles.visitText}>
          <h2 id="visitanos">Pasá por el local</h2>
          <p>Traé tu equipo para que lo revisemos, retirá una compra o consultanos lo que necesites.</p>
          <a
            className="btn"
            data-variant="whatsapp"
            href={whatsappUrl("Hola, CheTech. Quiero hacer una consulta.")}
            target="_blank"
            rel="noreferrer"
          >
            Escribir por WhatsApp
          </a>
        </div>
        <div className={styles.ticket}>
          <div className="barras" aria-hidden />
          <p className={styles.address}>
            {siteConfig.address}, {siteConfig.location}
          </p>
          <dl className={styles.hours}>
            {siteConfig.businessHours.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
          <p>
            <a href={siteConfig.mapsUrl} target="_blank" rel="noreferrer" className="enlace">
              Cómo llegar
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
