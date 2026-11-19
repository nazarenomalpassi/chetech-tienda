import type { Metadata } from "next";
import Link from "next/link";
import {
  Camera,
  ClipboardCheck,
  Mail,
  MapPin,
  MessageCircle,
  ShoppingBag,
  Wrench,
} from "lucide-react";
import { HoursBoard, OpenStatus } from "@/components/store/contact/hours-live";
import { CopyButton } from "@/components/store/copy-button";
import { PointerField } from "@/components/store/pointer-field";
import { siteConfig } from "@/config/site";
import { whatsappUrl } from "@/lib/whatsapp";
import styles from "./contact.module.css";

export const metadata: Metadata = {
  title: "Contacto y horarios",
  description:
    "Escribinos por WhatsApp o visitanos en Independencia 784, Río Tercero. Horarios del local y del taller.",
  alternates: { canonical: "/contacto" },
};

export default function ContactPage() {
  const channels = [
    {
      kind: "whatsapp",
      icon: MessageCircle,
      href: whatsappUrl("Hola, CheTech. Quiero hacer una consulta."),
      title: "WhatsApp",
      hint: siteConfig.phoneDisplay,
      action: "Escribir",
      copy: { value: `+${siteConfig.whatsapp}`, what: "el número" },
    },
    {
      kind: "instagram",
      icon: Camera,
      href: siteConfig.instagram,
      title: "Instagram",
      hint: siteConfig.instagramHandle,
      action: "Ver el perfil",
    },
    {
      kind: "mail",
      icon: Mail,
      href: `mailto:${siteConfig.email}`,
      title: "Mail",
      hint: siteConfig.email,
      action: "Escribir",
      copy: { value: siteConfig.email, what: "el mail" },
    },
    {
      kind: "mapa",
      icon: MapPin,
      href: siteConfig.mapsUrl,
      title: "Cómo llegar",
      hint: `${siteConfig.address}, ${siteConfig.location}`,
      action: "Abrir el mapa",
    },
  ];

  const shortcuts = [
    {
      href: "/servicio-tecnico",
      icon: Wrench,
      title: "Reparar un equipo",
      hint: "Diagnóstico sin costo",
    },
    {
      href: "/cuenta/reparaciones",
      icon: ClipboardCheck,
      title: "Seguir mi reparación",
      hint: "Con el mail que dejaste en el local",
    },
    {
      href: "/productos",
      icon: ShoppingBag,
      title: "Ver productos",
      hint: "Con precio y retiro en el local",
    },
  ];

  return (
    <div className={styles.wrap}>
      <div className={`oscuro ${styles.banner}`}>
        <div className={styles.bannerShape} aria-hidden />
        <div className={`page ${styles.bannerInner}`}>
          <nav className={styles.crumbs} aria-label="Ubicación">
            <Link href="/">Inicio</Link>
            <span aria-hidden="true">/</span>
            <span>Contacto</span>
          </nav>
          <header className={styles.head}>
            <h1>
              <span>Contacto</span>
            </h1>
            <p>
              La forma más rápida es WhatsApp. Si venís al local, el taller y la tienda están en el
              mismo lugar: {siteConfig.address}, {siteConfig.location}.
            </p>
            <OpenStatus />
          </header>
        </div>
      </div>

      <div className={`page ${styles.body}`}>
        <nav aria-label="Canales">
          <PointerField>
            <ul className={styles.channels}>
              {channels.map(({ kind, icon: Icon, href, title, hint, action, copy }, index) => (
                <li
                  key={kind}
                  className={`${kind === "whatsapp" ? "oscuro " : ""}${styles.channel}`}
                  data-kind={kind}
                  data-cursor
                  style={{ "--i": index } as React.CSSProperties}
                >
                  <span className={styles.iconWrap} aria-hidden>
                    <span className={styles.icon}>
                      <Icon />
                    </span>
                  </span>
                  <span className={styles.channelText}>
                    <a href={href} target="_blank" rel="noreferrer" className={styles.channelLink}>
                      {title}
                    </a>
                    {/* El mail puede cortarse después de la arroba, no en medio de una palabra. */}
                    <small>
                      {hint.includes("@") && !hint.startsWith("@") ? (
                        <>
                          {hint.slice(0, hint.indexOf("@") + 1)}
                          <wbr />
                          {hint.slice(hint.indexOf("@") + 1)}
                        </>
                      ) : (
                        hint
                      )}
                    </small>
                  </span>
                  <span className={styles.channelFoot}>
                    {copy ? (
                      <CopyButton value={copy.value} what={copy.what} className={styles.copy} />
                    ) : (
                      <span />
                    )}
                    <span className={styles.channelAction} aria-hidden>
                      {action}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </PointerField>
        </nav>

        <section className={styles.hours} aria-labelledby="horarios">
          <div className="barras" aria-hidden />
          <h2 id="horarios">Horarios</h2>
          <HoursBoard rows={siteConfig.businessHours} />
          <p className={styles.hoursNote}>
            Los pedidos de la tienda se retiran en el mismo horario.
          </p>
        </section>
      </div>

      <section className={`page ${styles.shortcuts}`} aria-labelledby="atajos">
        <h2 id="atajos">¿Qué necesitás resolver?</h2>
        <ul>
          {shortcuts.map(({ href, icon: Icon, title, hint }, index) => (
            <li key={href} style={{ "--i": index } as React.CSSProperties}>
              <Link href={href}>
                <Icon aria-hidden />
                <span>
                  <strong>{title}</strong>
                  <small>{hint}</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
