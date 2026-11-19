import type { Metadata } from "next";
import Link from "next/link";
import { LegalRequestForm } from "@/components/legal-request-form";
import { legalConfig } from "@/config/legal";

export const metadata: Metadata = {
  title: "Botón de arrepentimiento",
  description: "Iniciá una solicitud de revocación de una compra remota sin registrarte.",
  alternates: { canonical: "/arrepentimiento" },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function WithdrawalPage({ searchParams }: Props) {
  const query = await searchParams;
  // Desde el comprobante llega el número de pedido ya cargado. Solo se acepta con el formato de la tienda.
  const requested = typeof query.pedido === "string" ? query.pedido.trim().toUpperCase() : "";
  const orderReference = /^CHT-\d{6}$/.test(requested) ? requested : "";
  return (
    <section className="section shell legal-form-page">
      <p className="eyebrow">Derecho de arrepentimiento</p>
      <h1>Iniciá tu solicitud.</h1>
      <p className="lead">
        No necesitás registrarte, iniciar sesión, indicar un motivo ni realizar una llamada.
        Completá los datos mínimos para que podamos identificar la operación y responderte.
      </p>
      <div className="legal-form-layout">
        <LegalRequestForm kind="withdrawal" orderReference={orderReference} />
        <aside>
          <h2>Qué ocurre después</h2>
          <ol>
            <li>Registramos fecha y hora.</li>
            <li>Generamos una constancia.</li>
            <li>Revisamos la operación sin rechazo automático.</li>
            <li>Te respondemos por el canal elegido.</li>
          </ol>
          <p>
            También podés escribir a <a href={`mailto:${legalConfig.email}`}>{legalConfig.email}</a>
            .
          </p>
          <Link className="text-link" href="/cambios-y-devoluciones">
            Ver cambios y devoluciones
          </Link>
        </aside>
      </div>
    </section>
  );
}
