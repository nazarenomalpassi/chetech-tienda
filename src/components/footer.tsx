import Image from "next/image";
import Link from "next/link";
import { Undo2 } from "lucide-react";
import { siteConfig } from "@/config/site";

export function Footer() {
  return (
    <footer className="footer">
      <div className="shell footer-grid">
        <div>
          <Image src="/brand/chetech-horizontal-white.svg" width={210} height={54} alt="Chetech" />
          <p>Tecnología y servicio técnico especializado en Río Tercero.</p>
        </div>
        <div>
          <h2>Horarios</h2>
          <dl className="hours-list">
            {siteConfig.businessHours.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h2>Visitanos</h2>
          <p>
            {siteConfig.address}
            <br />
            {siteConfig.location}
          </p>
          <Link href="/contacto">Cómo llegar</Link>
        </div>
        <div>
          <h2>Información</h2>
          <nav>
            <Link href="/nosotros">Nosotros</Link>
            <Link href="/contacto">Contacto</Link>
            <Link href="/legal">Centro legal</Link>
            <Link href="/preguntas-frecuentes-legales">Preguntas frecuentes</Link>
          </nav>
        </div>
        <div>
          <h2>Legal</h2>
          <nav>
            <Link href="/terminos-y-condiciones">Términos</Link>
            <Link href="/privacidad">Privacidad</Link>
            <Link href="/cookies">Cookies</Link>
            <Link href="/garantias">Garantías</Link>
            <Link href="/cambios-y-devoluciones">Cambios y devoluciones</Link>
          </nav>
        </div>
        <div className="footer-contact">
          <h2>Conectemos</h2>
          <a href={siteConfig.instagram} target="_blank" rel="noreferrer">
            {siteConfig.instagramHandle}
          </a>
          <a href={`https://wa.me/${siteConfig.whatsapp}`}>{siteConfig.phoneDisplay}</a>
          <a className="footer-email" href={`mailto:${siteConfig.email}`}>
            {siteConfig.email}
          </a>
        </div>
      </div>
      <div className="shell footer-consumer-actions">
        <Link href="/arrepentimiento">
          <Undo2 />
          <span>
            <strong>Botón de arrepentimiento</strong>
            <small>Iniciá una solicitud sin registrarte</small>
          </span>
        </Link>
        <Link href="/solicitudes-de-privacidad">Solicitudes de privacidad</Link>
      </div>
      <div className="shell footer-bottom">
        <span>© {new Date().getFullYear()} Chetech</span>
        <span>Río Tercero · Córdoba</span>
      </div>
    </footer>
  );
}
