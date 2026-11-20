// Mails que no dependen de un pedido: el aviso de ingreso de la lista de espera, la constancia de una
// solicitud de arrepentimiento o de privacidad, y los avisos para el local. Los datos llegan en
// storefront_outbox.payload.
import { render, toPlainText } from "@react-email/render";
import { Button, Facts, MailLayout, P, Title } from "@/lib/mail/layout";
import type { RenderedMail } from "@/lib/mail/templates";

export type NoticeKind =
  "back_in_stock" | "consumer_request_received" | "admin_waitlist" | "admin_consumer_request";

export const noticeKinds: readonly string[] = [
  "back_in_stock",
  "consumer_request_received",
  "admin_waitlist",
  "admin_consumer_request",
];

export type NoticePayload = {
  /** Nombre de pila de quien recibe, si lo dejó. */
  name?: string;
  /** Qué pidió o qué producto volvió, en palabras. */
  subject?: string;
  productName?: string;
  productPath?: string;
  productPrice?: number;
  productImage?: string;
  reference?: string;
  requestType?: "withdrawal" | "privacy";
  contact?: string;
  createdAt?: string;
};

const money = (value: number) => `$ ${Math.round(value).toLocaleString("es-AR")}`;

const day = (value?: string) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Cordoba",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value ? new Date(value) : new Date());

const requestName = (type?: string) =>
  type === "privacy" ? "datos personales" : "arrepentimiento";

export async function renderNotice(
  kind: NoticeKind,
  payload: NoticePayload,
  site: string,
): Promise<RenderedMail | null> {
  const hello = payload.name ? `Hola, ${payload.name.trim().split(/\s+/)[0]}:` : "Hola:";
  let subject = "";
  let preview = "";
  let body: React.ReactNode = null;

  switch (kind) {
    case "back_in_stock": {
      if (!payload.productName || !payload.productPath) return null;
      const image = payload.productImage?.startsWith("http") ? payload.productImage : null;
      subject = `Ya está disponible: ${payload.productName}`;
      preview = "Nos pediste que te avisáramos cuando entrara.";
      body = (
        <>
          <Title>Ya está disponible</Title>
          <P>{hello}</P>
          <P>Nos pediste que te avisáramos, y ya entró:</P>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- es un mail: no hay next/image
            <img
              src={image}
              alt={payload.productName}
              width={240}
              style={{
                display: "block",
                width: 240,
                maxWidth: "100%",
                height: "auto",
                margin: "4px 0 14px",
                border: "1px solid #e0e0e0",
              }}
            />
          ) : null}
          <Facts
            rows={[
              ["Producto", payload.productName],
              ...(payload.productPrice
                ? ([["Precio", money(payload.productPrice)]] as [string, string][])
                : []),
              ["Retiro", "Independencia 784, Río Tercero"],
            ]}
          />
          <Button href={`${site}${payload.productPath}`}>Ver el producto</Button>
          <P muted>
            El stock puede cambiar: lo reservamos recién cuando confirmás el pedido. Te escribimos
            una sola vez por este aviso.
          </P>
        </>
      );
      break;
    }
    case "consumer_request_received": {
      if (!payload.reference) return null;
      subject = `Recibimos tu solicitud ${payload.reference}`;
      preview = `Constancia de tu solicitud de ${requestName(payload.requestType)}.`;
      body = (
        <>
          <Title>Recibimos tu solicitud</Title>
          <P>{hello}</P>
          <P>
            Registramos tu solicitud de {requestName(payload.requestType)}. Este mail es tu
            constancia: guardalo junto con el código.
          </P>
          <Facts
            rows={[
              ["Código", payload.reference],
              [
                "Solicitud",
                payload.requestType === "privacy"
                  ? "Datos personales"
                  : "Arrepentimiento de compra",
              ],
              ["Recibida", day(payload.createdAt)],
            ]}
          />
          <P>
            Te vamos a responder por el medio que elegiste. Si necesitás agregar algo, respondé este
            mail con el código.
          </P>
          <Button
            href={`${site}${payload.requestType === "privacy" ? "/privacidad" : "/cambios-y-devoluciones"}`}
          >
            {payload.requestType === "privacy"
              ? "Ver la política de privacidad"
              : "Ver cambios y devoluciones"}
          </Button>
        </>
      );
      break;
    }
    case "admin_waitlist": {
      subject = `Pidieron aviso: ${payload.subject ?? "un producto"}`;
      preview = payload.contact ? `Contacto: ${payload.contact}` : "Mirá la lista de espera.";
      body = (
        <>
          <Title>Alguien pidió que le avisen</Title>
          <Facts
            rows={[
              ["Qué busca", payload.subject ?? "Un producto"],
              ...(payload.name ? ([["Nombre", payload.name]] as [string, string][]) : []),
              ...(payload.contact ? ([["Contacto", payload.contact]] as [string, string][]) : []),
            ]}
          />
          <P>Queda en la lista de espera hasta que lo marques como avisado.</P>
          <Button href={`${site}/admin/lista-de-espera`}>Abrir la lista de espera</Button>
        </>
      );
      break;
    }
    case "admin_consumer_request": {
      if (!payload.reference) return null;
      subject = `Solicitud nueva de ${requestName(payload.requestType)}: ${payload.reference}`;
      preview = "Hay que responderla. Mirala en Administración.";
      body = (
        <>
          <Title>Solicitud nueva</Title>
          <P>
            Entró una solicitud de {requestName(payload.requestType)} desde la tienda. El cliente ya
            tiene su código; falta tu respuesta.
          </P>
          <Facts
            rows={[
              ["Código", payload.reference],
              ...(payload.name ? ([["Nombre", payload.name]] as [string, string][]) : []),
              ["Recibida", day(payload.createdAt)],
            ]}
          />
          <Button href={`${site}/admin/solicitudes`}>Abrir las solicitudes</Button>
        </>
      );
      break;
    }
    default:
      return null;
  }

  const html = await render(<MailLayout preview={preview}>{body}</MailLayout>);
  return { subject, html, text: toPlainText(html) };
}
