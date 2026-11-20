import Link from "next/link";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { formatShortDateTime } from "@/lib/format";
import { customerWhatsAppUrl } from "@/lib/whatsapp";
import { RequestStatusForm } from "../inbox-buttons";
import styles from "../inbox.module.css";

export type ConsumerRequest = {
  id: string;
  public_reference: string;
  request_type: "withdrawal" | "privacy";
  status: "received" | "in_review" | "responded" | "resolved" | "rejected_with_reason";
  first_name: string;
  last_name: string;
  contact: string;
  preferred_channel: "email" | "whatsapp" | "phone";
  order_reference: string | null;
  approximate_date: string | null;
  product: string | null;
  reason: string | null;
  privacy_right: "access" | "rectification" | "deletion" | "information" | "consent" | null;
  rejection_reason: string | null;
  created_at: string;
  responded_at: string | null;
  resolved_at: string | null;
};

export type RequestView = "abiertas" | "respondidas" | "cerradas";

export const requestViews: {
  key: RequestView;
  label: string;
  statuses: ConsumerRequest["status"][];
}[] = [
  { key: "abiertas", label: "Para responder", statuses: ["received", "in_review"] },
  { key: "respondidas", label: "Respondidas", statuses: ["responded"] },
  { key: "cerradas", label: "Cerradas", statuses: ["resolved", "rejected_with_reason"] },
];

const statusLabels: Record<ConsumerRequest["status"], string> = {
  received: "Recibida",
  in_review: "En revisión",
  responded: "Respondida",
  resolved: "Resuelta",
  rejected_with_reason: "Rechazada con motivo",
};

const statusTones: Record<ConsumerRequest["status"], string> = {
  received: "atencion",
  in_review: "espera",
  responded: "listo",
  resolved: "hecho",
  rejected_with_reason: "hecho",
};

const rightLabels: Record<NonNullable<ConsumerRequest["privacy_right"]>, string> = {
  access: "Ver sus datos",
  rectification: "Corregir o actualizar sus datos",
  deletion: "Borrar sus datos",
  information: "Saber cómo se usan",
  consent: "Retirar su consentimiento",
};

const channelLabels = { email: "mail", whatsapp: "WhatsApp", phone: "llamada" };

function waiting(createdAt: string, now: number) {
  const hours = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 3_600_000));
  if (hours < 1) return "hace menos de una hora";
  if (hours < 24) return hours === 1 ? "hace 1 hora" : `hace ${hours} horas`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}

function ContactLink({ request }: { request: ConsumerRequest }) {
  const hello = `Hola, ${request.first_name}. Te escribimos de CheTech por tu solicitud ${request.public_reference}.`;
  if (request.contact.includes("@")) {
    return (
      <a
        className="btn"
        data-variant="secondary"
        href={`mailto:${request.contact}?subject=${encodeURIComponent(`Tu solicitud ${request.public_reference} en CheTech`)}&body=${encodeURIComponent(hello)}`}
      >
        <Mail aria-hidden size={18} />
        Responder por mail
      </a>
    );
  }
  if (request.preferred_channel === "phone") {
    return (
      <a
        className="btn"
        data-variant="secondary"
        href={`tel:${request.contact.replace(/[^0-9+]/g, "")}`}
      >
        <Phone aria-hidden size={18} />
        Llamar
      </a>
    );
  }
  return (
    <a
      className="btn"
      data-variant="whatsapp"
      href={customerWhatsAppUrl(request.contact, hello)}
      target="_blank"
      rel="noreferrer"
    >
      <MessageCircle aria-hidden size={18} />
      Responder por WhatsApp
    </a>
  );
}

type Props = {
  requests: ConsumerRequest[];
  view: RequestView;
  counts: Record<RequestView, number>;
  now: number;
};

/** Solicitudes de arrepentimiento y de datos personales que entran por los formularios legales. */
export function RequestsBoard({ requests, view, counts, now }: Props) {
  return (
    <>
      <ul className={styles.views} aria-label="Vistas">
        {requestViews.map((item) => (
          <li key={item.key}>
            <Link
              href={
                item.key === "abiertas"
                  ? "/admin/solicitudes"
                  : `/admin/solicitudes?vista=${item.key}`
              }
              aria-current={view === item.key ? "page" : undefined}
            >
              {item.label} <span className={styles.count}>{counts[item.key]}</span>
            </Link>
          </li>
        ))}
      </ul>

      {requests.length ? (
        <ul className={styles.list}>
          {requests.map((request) => {
            const open = request.status === "received" || request.status === "in_review";
            return (
              <li
                key={request.id}
                className={styles.card}
                data-ready={request.status === "received" || undefined}
              >
                <div className={styles.cardHead}>
                  <p className={styles.subject}>
                    {request.request_type === "withdrawal"
                      ? "Arrepentimiento de compra"
                      : "Datos personales"}
                    <span className={styles.reference}>{request.public_reference}</span>
                  </p>
                  <p className={styles.state} data-tone={statusTones[request.status]}>
                    {statusLabels[request.status]}
                  </p>
                </div>

                <dl className={styles.facts}>
                  <div>
                    <dt>Quién</dt>
                    <dd>
                      {request.first_name} {request.last_name}
                    </dd>
                  </div>
                  <div>
                    <dt>Contacto</dt>
                    <dd>
                      {request.contact} · prefiere {channelLabels[request.preferred_channel]}
                    </dd>
                  </div>
                  <div>
                    <dt>Entró</dt>
                    <dd>
                      {formatShortDateTime(request.created_at)}
                      {open ? ` · ${waiting(request.created_at, now)}` : ""}
                    </dd>
                  </div>
                  {request.privacy_right ? (
                    <div>
                      <dt>Pide</dt>
                      <dd>{rightLabels[request.privacy_right]}</dd>
                    </div>
                  ) : null}
                  {request.product ? (
                    <div>
                      <dt>Producto</dt>
                      <dd>{request.product}</dd>
                    </div>
                  ) : null}
                  {request.order_reference ? (
                    <div>
                      <dt>Pedido</dt>
                      <dd>
                        {/^CHT-\d{6}$/i.test(request.order_reference) ? (
                          <Link
                            className="enlace"
                            href={`/admin/pedidos?buscar=${request.order_reference.toUpperCase()}`}
                          >
                            {request.order_reference.toUpperCase()}
                          </Link>
                        ) : (
                          request.order_reference
                        )}
                      </dd>
                    </div>
                  ) : null}
                  {request.approximate_date ? (
                    <div>
                      <dt>Fecha de la compra</dt>
                      <dd>{request.approximate_date.split("-").reverse().join("/")}</dd>
                    </div>
                  ) : null}
                </dl>

                {request.reason ? <p className={styles.quote}>{request.reason}</p> : null}
                {request.rejection_reason ? (
                  <p className={styles.hint}>Motivo del rechazo: {request.rejection_reason}</p>
                ) : null}

                <div className={styles.actions}>
                  <ContactLink request={request} />
                </div>

                <details className={styles.details} open={request.status === "received"}>
                  <summary>Cambiar el estado</summary>
                  <RequestStatusForm id={request.id} status={request.status} />
                </details>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.empty}>
          {view === "abiertas"
            ? "No hay solicitudes para responder. Las que entren por el botón de arrepentimiento o por el formulario de datos personales aparecen acá."
            : "No hay solicitudes en esta vista."}
        </p>
      )}
    </>
  );
}
