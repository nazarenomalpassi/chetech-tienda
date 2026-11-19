import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/legal.module.css";
import { legalConfig, legalDocuments, legalLinks } from "@/config/legal";

export const metadata: Metadata = {
  title: "Centro legal",
  description: "Políticas legales, comerciales y de privacidad de CheTech.",
  alternates: { canonical: "/legal" },
};

// Lo que no es un documento de legalDocuments tiene su descripción acá.
const extraSummaries: Record<string, string> = {
  "/arrepentimiento": "Pedí la devolución de una compra a distancia dentro de los 10 días, sin cuenta ni motivo.",
  "/preguntas-frecuentes-legales": "Respuestas cortas sobre compras, envíos, garantías y datos.",
  "/solicitudes-de-privacidad": "Pedí acceso, corrección o borrado de tus datos personales.",
};

export default function LegalCenterPage() {
  return (
    <div className={`page ${styles.page}`}>
      <header className={styles.head}>
        <h1>Centro legal</h1>
        <p>Las condiciones de compra, cómo cuidamos tus datos y los formularios para ejercer tus derechos.</p>
        <p className={styles.meta}>
          Versión {legalConfig.version}, actualizada el {legalConfig.lastUpdated}.
        </p>
      </header>
      <ul className={styles.index}>
        {legalLinks.map((link) => {
          const summary = legalDocuments[link.href.slice(1)]?.summary ?? extraSummaries[link.href] ?? "";
          return (
            <li key={link.href}>
              <Link href={link.href}>
                <strong>{link.label}</strong>
                {summary ? <span>{summary}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
