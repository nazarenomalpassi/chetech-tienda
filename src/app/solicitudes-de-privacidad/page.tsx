import type { Metadata } from "next";
import { LegalCrumbs } from "@/components/legal-document-page";
import styles from "@/components/legal.module.css";
import { LegalRequestForm } from "@/components/legal-request-form";
import { legalConfig } from "@/config/legal";

export const metadata: Metadata = {
  title: "Solicitudes de privacidad",
  description:
    "Solicitá acceso, rectificación, actualización, información o supresión de datos personales.",
  alternates: { canonical: "/solicitudes-de-privacidad" },
};

export default function PrivacyRequestPage() {
  return (
    <div className={`page ${styles.page}`}>
      <LegalCrumbs current="Solicitudes de privacidad" />
      <header className={styles.head}>
        <h1>Solicitudes de privacidad</h1>
        <p>
          Podés pedir ver, corregir, actualizar o borrar tus datos, o saber cómo los usamos. Pedimos solo lo necesario y
          no entregamos datos sin confirmar que sos vos.
        </p>
      </header>
      <div className={styles.formLayout}>
        <LegalRequestForm kind="privacy" />
        <aside className={styles.side}>
          <h2>Otra forma</h2>
          <p>
            También podés mandar la solicitud a <a href={`mailto:${legalConfig.privacyEmail}`}>{legalConfig.privacyEmail}</a>.
          </p>
          <p>La constancia confirma que la recibimos. No significa que se entregue información ni que se rechace.</p>
        </aside>
      </div>
    </div>
  );
}
