import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import { formatPrice, formatShortDateTime } from "@/lib/format";
import type { WaitlistEntry } from "@/lib/waitlist-match";
import { customerWhatsAppUrl } from "@/lib/whatsapp";
import { markWaitlistAction, removeWaitlistAction } from "../inbox-actions";
import { ConfirmButton, PendingButton } from "../inbox-buttons";
import styles from "../inbox.module.css";

export type WaitlistRow = WaitlistEntry & {
  /** Qué pidió, en palabras. */
  subject: string;
  /** Si la tienda le puede avisar sola por mail (dejó su mail y no pidió algo puntual). */
  auto: boolean;
  /** Producto en stock que responde al pedido, si ya hay. */
  match: { name: string; slug: string; price: number } | null;
};

type Props = {
  rows: WaitlistRow[];
  view: "pendientes" | "avisados";
  counts: { pendientes: number; avisados: number };
  site: string;
  mailOn: boolean;
};

function message(row: WaitlistRow, site: string) {
  const hello = row.contact_name ? `Hola, ${row.contact_name.trim().split(/\s+/)[0]}.` : "Hola.";
  return row.match
    ? `${hello} Te escribimos de CheTech: nos pediste que te avisáramos y ya entró ${row.match.name}, a ${formatPrice(row.match.price)}. Lo ves acá: ${site}/productos/${row.match.slug}`
    : `${hello} Te escribimos de CheTech por tu pedido de aviso (${row.subject}).`;
}

/** Lista de espera: quién pidió que le avisen, qué busca y si ya hay stock para escribirle. */
export function WaitlistBoard({ rows, view, counts, site, mailOn }: Props) {
  const ready = rows.filter((row) => row.match && !row.notified_at).length;
  return (
    <>
      <ul className={styles.views} aria-label="Vistas">
        <li>
          <Link
            href="/admin/lista-de-espera"
            aria-current={view === "pendientes" ? "page" : undefined}
          >
            Para avisar <span className={styles.count}>{counts.pendientes}</span>
          </Link>
        </li>
        <li>
          <Link
            href="/admin/lista-de-espera?vista=avisados"
            aria-current={view === "avisados" ? "page" : undefined}
          >
            Avisados <span className={styles.count}>{counts.avisados}</span>
          </Link>
        </li>
      </ul>

      {view === "pendientes" && ready ? (
        <p className={styles.callout} role="status">
          <strong>
            {ready === 1 ? "Ya hay stock para 1 persona." : `Ya hay stock para ${ready} personas.`}
          </strong>{" "}
          Escribiles y marcalas como avisadas.
        </p>
      ) : null}

      {rows.length ? (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li
              key={row.id}
              className={styles.card}
              data-ready={Boolean(row.match && !row.notified_at) || undefined}
            >
              <div className={styles.cardHead}>
                <p className={styles.subject}>{row.subject}</p>
                <p
                  className={styles.state}
                  data-tone={row.notified_at ? "hecho" : row.match ? "listo" : "espera"}
                >
                  {row.notified_at
                    ? `Avisado el ${formatShortDateTime(row.notified_at)}`
                    : row.match
                      ? "Ya hay stock"
                      : "Esperando stock"}
                </p>
              </div>

              <dl className={styles.facts}>
                <div>
                  <dt>Quién</dt>
                  <dd>{row.contact_name || "No dejó nombre"}</dd>
                </div>
                <div>
                  <dt>{row.email ? "Mail" : "WhatsApp"}</dt>
                  <dd>{row.email ?? row.phone}</dd>
                </div>
                <div>
                  <dt>Lo pidió</dt>
                  <dd>{formatShortDateTime(row.created_at)}</dd>
                </div>
                {row.match ? (
                  <div>
                    <dt>Para ofrecerle</dt>
                    <dd>
                      <Link className="enlace" href={`/productos/${row.match.slug}`}>
                        {row.match.name}
                      </Link>{" "}
                      · {formatPrice(row.match.price)}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {row.kind === "refurbished" && row.query && row.match && !row.notified_at ? (
                <p className={styles.hint}>
                  Pidió algo puntual. Fijate si esta tele le sirve antes de escribirle.
                </p>
              ) : null}
              {row.email && !row.notified_at ? (
                <p className={styles.hint}>
                  {!row.auto
                    ? "Dejó su mail, pero pidió algo puntual: la tienda no le escribe sola. Cuando entre una que le sirva, escribile vos."
                    : mailOn
                      ? "Dejó su mail: cuando se publique lo que pidió, la tienda le avisa sola y lo pasa a Avisados."
                      : "Dejó su mail. El aviso automático empieza a funcionar cuando se activen los mails (Resend); mientras tanto, escribile vos."}
                </p>
              ) : null}

              <div className={styles.actions}>
                {row.phone ? (
                  <a
                    className="btn"
                    data-variant="whatsapp"
                    href={customerWhatsAppUrl(row.phone, message(row, site))}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle aria-hidden size={18} />
                    Escribirle por WhatsApp
                  </a>
                ) : null}
                {row.email ? (
                  <a
                    className="btn"
                    data-variant="secondary"
                    href={`mailto:${row.email}?subject=${encodeURIComponent("Tu pedido de aviso en CheTech")}&body=${encodeURIComponent(message(row, site))}`}
                  >
                    <Mail aria-hidden size={18} />
                    Escribirle por mail
                  </a>
                ) : null}
                <form action={markWaitlistAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="notified" value={row.notified_at ? "0" : "1"} />
                  <PendingButton variant="secondary">
                    {row.notified_at ? "Volver a pendientes" : "Marcar como avisado"}
                  </PendingButton>
                </form>
                <form action={removeWaitlistAction} className={styles.removeForm}>
                  <input type="hidden" name="id" value={row.id} />
                  <ConfirmButton confirmLabel="Sí, quitar de la lista">Quitar</ConfirmButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          {view === "pendientes"
            ? "No hay nadie esperando. Cuando alguien deje su WhatsApp o su mail en un producto sin stock, en Reacondicionados o en Placas, aparece acá."
            : "Todavía no avisaste a nadie."}
        </p>
      )}
    </>
  );
}
