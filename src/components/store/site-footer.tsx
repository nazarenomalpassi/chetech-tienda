import Image from "next/image";
import Link from "next/link";
import { Undo2 } from "lucide-react";
import { siteConfig } from "@/config/site";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer}>
      <div className={`page ${styles.grid}`}>
        <div className={styles.brand}>
          <Image src="/brand/chetech-logo-blanco.svg" alt="CheTech" width={180} height={32} />
          <p>Servicio técnico y tienda de tecnología en Río Tercero, Córdoba.</p>
          <a className={styles.whatsapp} href={`https://wa.me/${siteConfig.whatsapp}`} target="_blank" rel="noreferrer">
            WhatsApp {siteConfig.phoneDisplay}
          </a>
        </div>

        <div>
          <h2>El local</h2>
          <p>
            {siteConfig.address}
            <br />
            {siteConfig.location}
          </p>
          <a className={styles.link} href={siteConfig.mapsUrl} target="_blank" rel="noreferrer">
            Cómo llegar
          </a>
          <dl className={styles.hours}>
            {siteConfig.businessHours.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h2>Comprar</h2>
          <nav className={styles.nav} aria-label="Comprar">
            <Link href="/productos">Todos los productos</Link>
            <Link href="/medios-de-pago">Medios de pago</Link>
            <Link href="/envios">Entregas y retiro</Link>
            <Link href="/garantias">Garantías</Link>
            <Link href="/cambios-y-devoluciones">Cambios y devoluciones</Link>
            <Link href="/servicio-tecnico">Servicio técnico</Link>
          </nav>
        </div>

        <div>
          <h2>Legal</h2>
          <nav className={styles.nav} aria-label="Legal">
            <Link href="/terminos-y-condiciones">Términos y condiciones</Link>
            <Link href="/privacidad">Privacidad</Link>
            <Link href="/cookies">Cookies</Link>
            <Link href="/legal">Centro legal</Link>
            <Link href="/solicitudes-de-privacidad">Solicitudes de privacidad</Link>
          </nav>
        </div>
      </div>

      <div className={`page ${styles.actions}`}>
        <Link href="/arrepentimiento" className={styles.regret}>
          <Undo2 aria-hidden size={20} />
          <span>
            <strong>Botón de arrepentimiento</strong>
            <small>Pedí la cancelación de una compra sin registrarte</small>
          </span>
        </Link>
        <a href={siteConfig.instagram} target="_blank" rel="noreferrer" className={styles.social}>
          Instagram {siteConfig.instagramHandle}
        </a>
      </div>

      <div className={`page ${styles.bottom}`}>
        <span>© {year} CheTech</span>
        <span>
          CUIT {siteConfig.taxId}. {siteConfig.fiscalCondition}. {siteConfig.invoiceType}.
        </span>
        <a
          href="https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario"
          target="_blank"
          rel="noreferrer"
        >
          Defensa de las y los consumidores
        </a>
        <span className={styles.barcode} aria-hidden />
      </div>
    </footer>
  );
}
