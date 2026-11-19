import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/store/product-card";
import styles from "@/components/store/landing.module.css";
import { WaitlistForm } from "@/components/store/waitlist-form";
import { getBoardProducts } from "@/lib/catalog";
import { isSellable, normalizeText } from "@/lib/catalog-query";
import { whatsappUrl } from "@/lib/whatsapp";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Placas para televisores",
  description:
    "Placas de TV probadas en nuestro banco de pruebas. Buscá por modelo del televisor o por código de la placa.",
  alternates: { canonical: "/placas-tv" },
};

// Compara sin espacios ni guiones: "32LB561B" encuentra "32 LB 561-B".
const compact = (value: string) => normalizeText(value).replace(/\s+/g, "");

export default async function BoardsPage({ searchParams }: { searchParams: Promise<{ modelo?: string }> }) {
  const { modelo = "" } = await searchParams;
  const query = modelo.trim().slice(0, 80);
  const boards = (await getBoardProducts()).filter(isSellable);
  const needle = compact(query);
  const matches = needle.length >= 3
    ? boards.filter((product) =>
        [product.name, product.board?.code, product.board?.partNumber, ...(product.board?.compatibleModels ?? [])]
          .filter(Boolean)
          .some((value) => compact(String(value)).includes(needle)),
      )
    : boards;
  const searching = needle.length >= 3;

  return (
    <div className={`page ${styles.page}`}>
      <nav className={styles.crumbs} aria-label="Ubicación">
        <Link href="/">Inicio</Link>
        <span aria-hidden="true">/</span>
        <span>Placas de TV</span>
      </nav>
      <header className={styles.head}>
        <h1>Placas de TV probadas</h1>
        <p>
          Cada placa pasa por el banco de pruebas antes de venderse. Buscá por el modelo de tu tele (está en la
          etiqueta de atrás) o por el código impreso en la placa.
        </p>
      </header>

      <form className={styles.finder} role="search" action="/placas-tv">
        <label htmlFor="modelo">Modelo de la tele o código de la placa</label>
        <div className={styles.finderRow}>
          <input id="modelo" name="modelo" defaultValue={query} placeholder="Ej.: 32LB561B o EAX65423701" autoComplete="off" />
          <button className="btn">Buscar</button>
        </div>
        <small>Con 3 letras o números ya busca.</small>
      </form>

      {matches.length ? (
        <>
          <p className={styles.result} role="status">
            {searching
              ? `${matches.length} ${matches.length === 1 ? "placa sirve" : "placas pueden servir"} para “${query}”. Confirmá la compatibilidad por WhatsApp antes de comprar.`
              : `${matches.length} ${matches.length === 1 ? "placa disponible" : "placas disponibles"}.`}
          </p>
          <div className={styles.grid}>
            {matches.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        </>
      ) : (
        <p className={styles.result} role="status">
          {searching
            ? `Todavía no tenemos publicada una placa para “${query}”. Puede estar en el taller sin publicar: dejanos tu contacto o mandanos una foto.`
            : "Todavía no hay placas publicadas. Muchas están en el taller: dejanos el modelo y te avisamos."}
        </p>
      )}

      <div className={styles.split}>
        <section className={styles.card} data-signal="magenta" aria-labelledby="aviso-placa">
          <h2 id="aviso-placa">Te avisamos cuando entre</h2>
          <p>Dejá el modelo de la tele y tu WhatsApp o mail. Te escribimos una sola vez, cuando la tengamos.</p>
          <WaitlistForm kind="board" query={query || undefined} cta="Avisarme" />
        </section>
        <section className={styles.card} data-signal="cian" aria-labelledby="foto-placa">
          <h2 id="foto-placa">¿No sabés qué placa es?</h2>
          <ol className={styles.steps}>
            <li>Sacale una foto a la etiqueta de atrás de la tele.</li>
            <li>Si podés, otra a la placa, donde se vea el código.</li>
            <li>Mandalas por WhatsApp y te decimos si la tenemos o si conviene repararla.</li>
          </ol>
          <a
            className="btn"
            data-variant="whatsapp"
            href={whatsappUrl(
              `Hola, CheTech. Busco una placa para mi tele${query ? ` modelo ${query}` : ""}. Les mando la foto de la etiqueta.`,
            )}
            target="_blank"
            rel="noreferrer"
          >
            Mandar la foto por WhatsApp
          </a>
          <Link className="enlace" href="/servicio-tecnico">
            O traela al taller y la diagnosticamos
          </Link>
        </section>
      </div>
    </div>
  );
}
