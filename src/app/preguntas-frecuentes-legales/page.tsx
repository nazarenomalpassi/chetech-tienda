import type { Metadata } from "next";
import Link from "next/link";
import { legalConfig } from "@/config/legal";

export const metadata: Metadata = {
  title: "Preguntas frecuentes legales y comerciales",
  alternates: { canonical: "/preguntas-frecuentes-legales" },
};

const questions = [
  [
    "¿El carrito confirma la compra?",
    "No. El carrito genera una solicitud y un total estimado. Chetech confirma stock, precio, pago y entrega por WhatsApp.",
  ],
  [
    "¿Cómo se calcula el envío?",
    "El costo de envío se confirma según destino antes del pago. No se informa como gratuito salvo que exista una promoción real.",
  ],
  [
    "¿Los productos y reparaciones tienen garantía?",
    "Todos nuestros productos y reparaciones cuentan con garantía. Consultanos por las condiciones correspondientes al producto o reparación.",
  ],
  [
    "¿Cómo confirmo una placa o repuesto?",
    "Compará el código de la pieza original o envianos una fotografía por WhatsApp. La consulta ayuda a confirmar compatibilidad y no elimina derechos.",
  ],
  [
    "¿Necesito una cuenta para arrepentirme?",
    "No. El formulario de arrepentimiento no requiere cuenta, contraseña ni motivo obligatorio.",
  ],
  [
    "¿Cómo pido información sobre mis datos?",
    "Usá el formulario de privacidad o escribí al correo legal. Se verificará razonablemente la identidad antes de entregar información.",
  ],
] as const;

export default function LegalFaqPage() {
  return (
    <section className="section shell legal-page">
      <p className="eyebrow">Ayuda comercial</p>
      <h1>Preguntas frecuentes</h1>
      <div className="faq-list">
        {questions.map(([question, answer]) => (
          <details key={question}>
            <summary>
              {question}
              <span>+</span>
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
      <aside className="legal-contact">
        <strong>¿No encontraste la respuesta?</strong>
        <p>
          Escribinos a <a href={`mailto:${legalConfig.email}`}>{legalConfig.email}</a>.
        </p>
        <Link className="text-link" href="/contacto">
          Ver contacto
        </Link>
      </aside>
    </section>
  );
}
