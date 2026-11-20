import Link from "next/link";
import type { MailSample } from "@/lib/mail/samples";
import { MailFrame, TestMailForm } from "./mail-tools";
import styles from "./mails.module.css";
import { mailGroups } from "./samples";

/** La lista de todos los mails, agrupados. */
export function MailsOverview({
  samples,
  email,
  sending,
}: {
  samples: MailSample[];
  email: string;
  sending: boolean;
}) {
  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">Tienda</p>
        <h1>Mails</h1>
        <p>
          Todos los mails que manda la tienda, armados con un pedido de ejemplo. Tocá uno para verlo
          como le llega a la persona y mandate una prueba a tu mail.
        </p>
      </div>

      <dl className={styles.setup}>
        <div>
          <dt>Envío</dt>
          <dd>{sending ? "Activo, por Resend" : "Apagado: falta la clave de Resend"}</dd>
        </div>
        <div>
          <dt>Salen desde</dt>
          <dd>{process.env.MAIL_FROM ?? "CheTech <hola@chetechstore.com>"}</dd>
        </div>
        <div>
          <dt>Las respuestas llegan a</dt>
          <dd>{process.env.MAIL_REPLY_TO ?? "chetech.reparaciones@gmail.com"}</dd>
        </div>
        <div>
          <dt>Las pruebas te llegan a</dt>
          <dd>{email}</dd>
        </div>
      </dl>

      <div className={styles.bar}>
        <p className={styles.note}>
          Mandarte los {samples.length} juntos usa {samples.length} de los 100 envíos por día del
          plan gratis de Resend.
        </p>
        <TestMailForm id="todos" label={`Mandarme los ${samples.length}`} variant="secondary" />
      </div>

      {mailGroups.map(({ group, note }) => {
        const items = samples.filter((sample) => sample.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group} className={styles.group} aria-labelledby={`grupo-${group}`}>
            <h2 id={`grupo-${group}`}>
              {group} <span className="visually-hidden">({items.length} mails)</span>
            </h2>
            <p>{note}</p>
            <ul className={styles.list}>
              {items.map((sample) => (
                <li key={sample.id}>
                  <Link href={`/admin/mails/${sample.id}`}>
                    <span className={styles.name}>{sample.label}</span>
                    <span className={styles.when}>{sample.trigger}</span>
                    <span className={styles.subjectLine}>Asunto: {sample.subject}</span>
                    <span className={styles.go} aria-hidden="true">
                      Ver
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

/** Un mail: asunto, cuándo sale, vista previa y botón de prueba. */
export function MailDetail({ samples, index }: { samples: MailSample[]; index: number }) {
  const sample = samples[index];
  const previous = samples[index - 1];
  const next = samples[index + 1];

  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">
          <Link href="/admin/mails">Todos los mails</Link>
        </p>
        <h1>{sample.label}</h1>
        <p>{sample.trigger}</p>
      </div>

      <dl className={styles.facts}>
        <div>
          <dt>Asunto</dt>
          <dd>{sample.subject}</dd>
        </div>
        <div>
          <dt>Grupo</dt>
          <dd>{sample.group}</dd>
        </div>
        <div>
          <dt>Datos</dt>
          <dd>De ejemplo: el pedido y la persona son inventados.</dd>
        </div>
      </dl>

      <div className={styles.bar}>
        <TestMailForm id={sample.id} label="Mandarme una prueba" />
      </div>

      <MailFrame html={sample.html} title={`Vista previa: ${sample.label}`} />

      <details className={styles.text}>
        <summary>Versión solo texto</summary>
        <p className={styles.note}>
          Va junto con el mail: la usan los programas que no muestran diseño y ayuda a que no caiga
          en spam.
        </p>
        <pre>{sample.text}</pre>
      </details>

      <nav className={styles.pager} aria-label="Otros mails">
        {previous ? (
          <Link className="btn" data-variant="secondary" href={`/admin/mails/${previous.id}`}>
            Anterior: {previous.label}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link className="btn" data-variant="secondary" href={`/admin/mails/${next.id}`}>
            Siguiente: {next.label}
          </Link>
        ) : null}
      </nav>
    </>
  );
}
