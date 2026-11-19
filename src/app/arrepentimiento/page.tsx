import type { Metadata } from "next";
import Link from "next/link";
import { LegalCrumbs } from "@/components/legal-document-page";
import styles from "@/components/legal.module.css";
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
    <div className={`page ${styles.page}`}>
      <LegalCrumbs current="Botón de arrepentimiento" />
      <header className={styles.head}>
        <h1>Botón de arrepentimiento</h1>
        <p>
          Si compraste a distancia, tenés 10 días desde que recibís el producto para arrepentirte. No hace falta cuenta,
          motivo ni llamada: completá lo justo para ubicar la compra.
        </p>
      </header>
      <div className={styles.formLayout}>
        <LegalRequestForm kind="withdrawal" orderReference={orderReference} />
        <aside className={styles.side}>
          <h2>Qué pasa después</h2>
          <ol>
            <li>Queda registrada con fecha y hora.</li>
            <li>Te damos un número de constancia.</li>
            <li>Revisamos la compra, sin rechazos automáticos.</li>
            <li>Te respondemos por el canal que elegiste.</li>
          </ol>
          <p>
            También podés escribir a <a href={`mailto:${legalConfig.email}`}>{legalConfig.email}</a>.
          </p>
          <p>
            <Link href="/cambios-y-devoluciones">Cambios y devoluciones</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
