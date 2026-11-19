// Mails de pedidos. Cada tipo de la cola (storefront_outbox.kind) tiene su asunto y su cuerpo.
import { render, toPlainText } from "@react-email/render";
import type { OrderPayload } from "@/lib/commerce/types";
import { discountLines } from "@/lib/commerce/discounts";
import { Button, Facts, MailLayout, P, Receipt, Title } from "@/lib/mail/layout";

export type MailKind =
  | "transfer_instructions"
  | "order_received"
  | "payment_confirmed"
  | "ready_for_pickup"
  | "shipped"
  | "reservation_reminder"
  | "order_expired"
  | "order_cancelled"
  | "review_request"
  | "admin_new_order"
  | "admin_transfer_reported"
  | "admin_attention";

export type RenderedMail = { subject: string; html: string; text: string };

const money = (value: number) => `$ ${Math.round(value).toLocaleString("es-AR")}`;

const when = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-AR", {
        timeZone: "America/Argentina/Cordoba",
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "";

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}

function receipt(order: OrderPayload, footer?: string) {
  return (
    <Receipt
      orderNumber={order.order_number}
      items={order.items.map((item) => ({ name: item.name, quantity: item.quantity, subtotal: item.subtotal }))}
      shipping={order.shipping_cost}
      discounts={discountLines(order)}
      total={order.total}
      footer={footer}
    />
  );
}

const reviewUrl = "https://www.google.com/maps/search/?api=1&query=CheTech+Independencia+784+Rio+Tercero";

export async function renderMail(
  kind: MailKind,
  order: OrderPayload,
  links: { order: string; admin: string },
): Promise<RenderedMail | null> {
  const hello = `Hola, ${firstName(order.customer_name)}:`;
  let subject = "";
  let preview = "";
  let body: React.ReactNode = null;

  switch (kind) {
    case "transfer_instructions": {
      subject = `Transferí ${money(order.total)} para confirmar tu pedido ${order.order_number}`;
      preview = "Te dejamos los datos para transferir y el vencimiento de la reserva.";
      const transfer = order.transfer;
      body = (
        <>
          <Title>Te reservamos el pedido</Title>
          <P>{hello}</P>
          <P>Para confirmarlo, transferí el monto exacto antes de que venza la reserva.</P>
          <Facts
            rows={[
              ["Monto", money(order.total)],
              ...((transfer?.alias ? [["Alias", transfer.alias]] : []) as [string, string][]),
              ...((transfer?.cvu ? [["CBU o CVU", transfer.cvu]] : []) as [string, string][]),
              ...((transfer?.holder ? [["Titular", transfer.holder]] : []) as [string, string][]),
              ...((transfer?.bank ? [["Banco", transfer.bank]] : []) as [string, string][]),
              ["Vence", when(order.reserved_until)],
            ]}
          />
          {receipt(order)}
          <P>Cuando transfieras, avisanos desde el pedido. Lo confirmamos apenas veamos la acreditación.</P>
          <Button href={links.order}>Ya transferí</Button>
        </>
      );
      break;
    }
    case "order_received": {
      subject = `Recibimos tu pedido ${order.order_number}`;
      preview = "Lo pagás al retirar en Independencia 784.";
      body = (
        <>
          <Title>Recibimos tu pedido</Title>
          <P>{hello}</P>
          <P>Te lo reservamos para que lo pagues al retirar. Te avisamos por mail cuando esté listo.</P>
          {receipt(order, `Reserva hasta el ${when(order.reserved_until)}.`)}
          <P>Retiro en Independencia 784, Río Tercero.</P>
          <Button href={links.order}>Ver mi pedido</Button>
        </>
      );
      break;
    }
    case "payment_confirmed": {
      subject = `Pago confirmado: preparamos tu pedido ${order.order_number}`;
      preview = "Ya tenemos tu pago. Te avisamos cuando esté listo.";
      body = (
        <>
          <Title>Pago confirmado</Title>
          <P>{hello}</P>
          <P>Ya tenemos tu pedido y tu pago.</P>
          {receipt(order, order.payment_method === "mercadopago" ? "Pagado con Mercado Pago." : "Pagado por transferencia.")}
          <P>
            {order.delivery_method === "pickup"
              ? "Retiro en Independencia 784, Río Tercero. Te avisamos por mail cuando esté listo."
              : "Te avisamos por mail cuando salga, con el número de seguimiento."}
          </P>
          <Button href={links.order}>Ver mi pedido</Button>
        </>
      );
      break;
    }
    case "ready_for_pickup": {
      subject = `Tu pedido ${order.order_number} está listo para retirar`;
      preview = "Mostrá el código en el local y listo.";
      body = (
        <>
          <Title>Listo para retirar</Title>
          <P>{hello}</P>
          <P>Tu pedido te espera en Independencia 784, Río Tercero.</P>
          <Facts
            rows={[
              ["Código de retiro", order.pickup_code ?? ""],
              ["Horario", "Lunes a viernes de 09:30 a 19:00. Sábados de 10:00 a 12:30 y de 16:00 a 20:00."],
              ...((order.payment_status !== "approved" ? [["A pagar al retirar", money(order.total)]] : []) as [string, string][]),
            ]}
          />
          <P>Mostrá el código o el QR del pedido cuando vengas. Si lo retira otra persona, que traiga el código.</P>
          <Button href={links.order}>Ver el código y el QR</Button>
        </>
      );
      break;
    }
    case "shipped": {
      subject = `Tu pedido ${order.order_number} ya viaja`;
      preview = order.tracking_code ? `Número de seguimiento: ${order.tracking_code}` : "Ya salió tu pedido.";
      body = (
        <>
          <Title>Tu pedido ya viaja</Title>
          <P>{hello}</P>
          {order.tracking_code ? <Facts rows={[["Seguimiento", order.tracking_code]]} /> : null}
          <Button href={order.tracking_url ?? links.order}>{order.tracking_url ? "Seguir el envío" : "Ver mi pedido"}</Button>
        </>
      );
      break;
    }
    case "reservation_reminder": {
      subject = `Tu reserva del pedido ${order.order_number} vence hoy`;
      preview = `Vence el ${when(order.reserved_until)}.`;
      body = (
        <>
          <Title>Tu reserva vence pronto</Title>
          <P>{hello}</P>
          <P>
            La reserva de tu pedido vence el {when(order.reserved_until)}.{" "}
            {order.payment_method === "transfer"
              ? "Si ya transferiste, avisanos desde el pedido."
              : "Si no llegás a retirarlo, escribinos por WhatsApp."}
          </P>
          {receipt(order)}
          <Button href={links.order}>Ver mi pedido</Button>
        </>
      );
      break;
    }
    case "order_expired": {
      subject = `Venció la reserva del pedido ${order.order_number}`;
      preview = "Si todavía lo querés, podés volver a pedirlo.";
      body = (
        <>
          <Title>Venció la reserva</Title>
          <P>{hello}</P>
          <P>No recibimos el pago a tiempo y los productos volvieron a estar a la venta. Si todavía los querés, podés hacer el pedido de nuevo.</P>
          {receipt(order)}
          <Button href={links.order.split("/pedido/")[0] + "/productos"}>Volver a la tienda</Button>
        </>
      );
      break;
    }
    case "order_cancelled": {
      subject = `Cancelamos tu pedido ${order.order_number}`;
      preview = order.history.at(-1)?.note ?? "Cancelamos tu pedido.";
      body = (
        <>
          <Title>Cancelamos tu pedido</Title>
          <P>{hello}</P>
          <P>{order.history.at(-1)?.note ?? "Cancelamos tu pedido."}</P>
          {receipt(order)}
          <P muted>Si tenés dudas, respondé este mail o escribinos por WhatsApp.</P>
        </>
      );
      break;
    }
    case "review_request": {
      subject = "¿Qué tal tu compra?";
      preview = "Tu opinión ayuda a otros vecinos a elegir.";
      body = (
        <>
          <Title>¿Qué tal tu compra?</Title>
          <P>{hello}</P>
          <P>Gracias por comprar en CheTech. Si te gustó la atención, una reseña en Google nos ayuda muchísimo.</P>
          <Button href={reviewUrl}>Dejar una reseña</Button>
        </>
      );
      break;
    }
    case "admin_new_order": {
      const payment = { mercadopago: "Mercado Pago", transfer: "transferencia", pickup: "pago al retirar" }[order.payment_method ?? "pickup"];
      subject = `Pedido nuevo ${order.order_number}: ${money(order.total)}, ${payment}`;
      preview = `${order.customer_name}, ${order.delivery_option?.label ?? "retiro"}`;
      body = (
        <>
          <Title>Pedido nuevo</Title>
          <Facts
            rows={[
              ["Cliente", order.customer_name],
              ["WhatsApp", order.customer_phone],
              ["Mail", order.customer_email],
              ["Entrega", order.delivery_option?.label ?? "Retiro en el local"],
              ["Pago", payment ?? ""],
            ]}
          />
          {receipt(order)}
          <Button href={links.admin}>Abrir en Administración</Button>
        </>
      );
      break;
    }
    case "admin_transfer_reported": {
      subject = `${order.customer_name} avisó que transfirió: ${order.order_number}`;
      preview = `Confirmá ${money(order.total)} cuando veas la acreditación.`;
      body = (
        <>
          <Title>Avisaron una transferencia</Title>
          <P>
            {order.customer_name} avisó que transfirió {money(order.total)} por el pedido {order.order_number}. Cuando veas la
            acreditación, confirmalo en Administración.
          </P>
          <Button href={links.admin}>Confirmar el pago</Button>
        </>
      );
      break;
    }
    case "admin_attention": {
      subject = `Revisá el pedido ${order.order_number}`;
      preview = "Hay un pago que necesita tu revisión.";
      body = (
        <>
          <Title>Un pedido necesita revisión</Title>
          <P>El pedido {order.order_number} tiene un pago que no se pudo aplicar solo. Revisalo en Administración.</P>
          <Button href={links.admin}>Abrir el pedido</Button>
        </>
      );
      break;
    }
    default:
      return null;
  }

  const element = <MailLayout preview={preview}>{body}</MailLayout>;
  const html = await render(element);
  const text = toPlainText(html);
  return { subject, html, text };
}
