import type { Metadata } from "next";
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
    <section className="section shell legal-form-page">
      <p className="eyebrow">Tus datos, tus derechos</p>
      <h1>Solicitud de privacidad.</h1>
      <p className="lead">
        Podés pedir acceso, rectificación, actualización, información sobre el uso o supresión.
        Solicitamos solamente lo necesario y no entregamos datos sin verificar razonablemente la
        identidad.
      </p>
      <div className="legal-form-layout">
        <LegalRequestForm kind="privacy" />
        <aside>
          <h2>Canal alternativo</h2>
          <p>
            También podés enviar la solicitud a{" "}
            <a href={`mailto:${legalConfig.privacyEmail}`}>{legalConfig.privacyEmail}</a>.
          </p>
          <p>
            La constancia confirma la recepción; no implica una entrega automática de información ni
            un rechazo.
          </p>
        </aside>
      </div>
    </section>
  );
}
