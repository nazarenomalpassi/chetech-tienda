import Link from "next/link";
import { legalConfig, type LegalDocument } from "@/config/legal";

export function LegalDocumentPage({ document }: { document: LegalDocument }) {
  return (
    <section className="section shell legal-page">
      <nav className="legal-breadcrumb" aria-label="Navegación legal">
        <Link href="/legal">Centro legal</Link>
        <span>/</span>
        <span>{document.title}</span>
      </nav>
      <p className="eyebrow">Información legal y comercial</p>
      <h1>{document.title}</h1>
      <p className="lead">{document.summary}</p>
      <dl className="legal-version">
        <div>
          <dt>Versión</dt>
          <dd>{legalConfig.version}</dd>
        </div>
        <div>
          <dt>Última actualización</dt>
          <dd>{legalConfig.lastUpdated}</dd>
        </div>
      </dl>
      <div className="legal-sections">
        {document.sections.map((section) => (
          <section key={section.title} id={section.title.toLowerCase().replaceAll(" ", "-")}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.items && (
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      <aside className="legal-contact">
        <strong>¿Necesitás ayuda?</strong>
        <p>
          Escribinos a <a href={`mailto:${legalConfig.email}`}>{legalConfig.email}</a> o consultá
          los demás canales disponibles.
        </p>
        <Link className="text-link" href="/contacto">
          Ver contacto
        </Link>
      </aside>
    </section>
  );
}
