import Link from "next/link";
import { legalConfig, type LegalDocument } from "@/config/legal";
import styles from "./legal.module.css";

function anchor(title: string) {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function LegalCrumbs({ current }: { current: string }) {
  return (
    <nav className={styles.crumbs} aria-label="Ruta">
      <Link href="/legal">Centro legal</Link>
      <span aria-hidden>/</span>
      <span aria-current="page">{current}</span>
    </nav>
  );
}

export function LegalHelp({ title = "¿Te quedó una duda?" }: { title?: string }) {
  return (
    <aside className={styles.help}>
      <strong>{title}</strong>
      <p>
        Escribinos a{" "}
        <a href={`mailto:${legalConfig.email}`} className="enlace">
          {legalConfig.email}
        </a>{" "}
        o por WhatsApp al {legalConfig.whatsapp}.
      </p>
      <p>
        <Link href="/contacto" className="enlace">
          Ver todos los canales
        </Link>
      </p>
    </aside>
  );
}

export function LegalDocumentPage({ document }: { document: LegalDocument }) {
  const sections = document.sections.map((section) => ({ ...section, id: anchor(section.title) }));
  return (
    <div className={`page ${styles.page}`}>
      <LegalCrumbs current={document.title} />
      <header className={styles.head}>
        <h1>{document.title}</h1>
        <p>{document.summary}</p>
        <p className={styles.meta}>
          Versión {legalConfig.version}, actualizada el {legalConfig.lastUpdated}.
        </p>
      </header>
      <div className={styles.doc}>
        {sections.length > 2 ? (
          <nav className={styles.toc} aria-label="En esta página">
            <p>En esta página</p>
            <ol>
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>
        ) : (
          <div aria-hidden />
        )}
        <div className={styles.article}>
          {sections.map((section) => (
            <section key={section.id} id={section.id} className={styles.section}>
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.items ? (
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
          <LegalHelp />
        </div>
      </div>
    </div>
  );
}
