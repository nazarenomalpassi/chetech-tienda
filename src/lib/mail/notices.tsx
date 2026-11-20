/* eslint-disable @next/next/no-img-element -- es un mail: las imágenes van como <img> con dirección completa. */
// Mails que no dependen de un pedido: el aviso de ingreso de la lista de espera, la constancia de una
// solicitud de arrepentimiento o de privacidad, y los avisos para el local. Los datos llegan en
// storefront_outbox.payload.
import { render, toPlainText } from "@react-email/render";
import { Button, Facts, Help, MailLayout, mailPhoto, P, Title } from "@/lib/mail/layout";
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

/** "20 de noviembre de 2026, 12:10" */
const day = (value?: string) => {
  const date = value ? new Date(value) : new Date();
  const zone = "America/Argentina/Cordoba";
  const dayPart = new Intl.DateTimeFormat("es-AR", {
    timeZone: zone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("es-AR", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${dayPart}, ${time}`;
};

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
  let kicker: string | undefined;
  let reason = "Te escribimos porque lo pediste en chetechstore.com.";
  let body: React.ReactNode = null;

  switch (kind) {
    case "back_in_stock": {
      if (!payload.productName || !payload.productPath) return null;
      const image = mailPhoto(payload.productImage, 480);
      subject = `Ya está disponible: ${payload.productName}`;
      preview = "Nos pediste que te avisáramos cuando entrara. Ya está en la tienda.";
      kicker = "Lista de espera";
      reason = "Te escribimos una sola vez, porque pediste que te avisáramos en chetechstore.com.";
      body = (
        <>
          <Title>Ya está disponible</Title>
          <P>{hello}</P>
          <P>Nos pediste que te avisáramos, y ya entró:</P>
          {image ? (
            <img
              src={image}
              alt={payload.productName}
              width={240}
              height={240}
              style={{
                display: "block",
                width: 240,
                height: 240,
                margin: "4px 0 16px",
                border: "1px solid #d6d6d6",
                backgroundColor: "#ffffff",
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
          <P muted>El stock puede cambiar: te lo reservamos recién cuando confirmás el pedido.</P>
          <Help />
        </>
      );
      break;
    }
    case "consumer_request_received": {
      if (!payload.reference) return null;
      subject = `Recibimos tu solicitud ${payload.reference}`;
      preview = `Constancia de tu solicitud de ${requestName(payload.requestType)}.`;
      kicker = `Constancia ${payload.reference}`;
      reason = "Te escribimos porque enviaste esta solicitud desde chetechstore.com.";
      body = (
        <>
          <Title>Recibimos tu solicitud</Title>
          <P>{hello}</P>
          <P>
            Registramos tu solicitud de {requestName(payload.requestType)}. Este mail es tu
            constancia: guardalo junto con el código.
          </P>
          <Facts
            large="Código"
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
      kicker = "Para el local";
      reason = "Aviso automático de la tienda para el local.";
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
      kicker = "Para el local";
      reason = "Aviso automático de la tienda para el local.";
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

  const html = await render(
    <MailLayout preview={preview} kicker={kicker} reason={reason}>
      {body}
    </MailLayout>,
  );
  return { subject, html, text: toPlainText(html) };
}
