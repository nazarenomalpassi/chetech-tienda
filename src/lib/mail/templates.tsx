// Mails de pedidos. Cada tipo de la cola (storefront_outbox.kind) tiene su asunto y su cuerpo.
import { render, toPlainText } from "@react-email/render";
import type { OrderPayload } from "@/lib/commerce/types";
import { discountLines } from "@/lib/commerce/discounts";
import {
  Button,
  Details,
  Facts,
  Help,
  MailLayout,
  mailSite,
  P,
  Receipt,
  Steps,
  Title,
} from "@/lib/mail/layout";

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

const zone = "America/Argentina/Cordoba";

/** "sábado 21 de noviembre, 19:00" */
export function when(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const day = new Intl.DateTimeFormat("es-AR", {
    timeZone: zone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  const time = new Intl.DateTimeFormat("es-AR", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${day.replace(",", "")}, ${time}`;
}

/** "20/11/2026" */
function shortDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: zone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}

const pickupHours =
  "Lunes a viernes de 09:30 a 19:00. Sábados de 10:00 a 12:30 y de 16:00 a 20:00.";

function receipt(order: OrderPayload, footer?: string) {
  const site = mailSite();
  return (
    <Receipt
      orderNumber={order.order_number}
      date={shortDate(order.created_at)}
      items={order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        subtotal: item.subtotal,
        image: item.image,
        href: item.slug ? `${site}/productos/${item.slug}` : null,
      }))}
      shipping={order.shipping_cost}
      discounts={discountLines(order)}
      total={order.total}
      footer={footer}
    />
  );
}

function addressLine(address: Record<string, string> | null) {
  if (!address) return "";
  const street = [address.street, address.number].filter(Boolean).join(" ");
  const apartment = address.apartment ? `, ${address.apartment}` : "";
  const place = [address.city, address.province].filter(Boolean).join(", ");
  return [
    `${street}${apartment}`,
    [place, address.postal_code ? `(${address.postal_code})` : ""].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(". ");
}

function deliveryBlock(order: OrderPayload) {
  if (order.delivery_method === "pickup") {
    return { label: "Entrega", lines: ["Retiro en el local", "Independencia 784, Río Tercero"] };
  }
  const address = addressLine(order.shipping_address);
  return {
    label: "Entrega",
    lines: [
      order.delivery_option?.label ??
        (order.delivery_method === "shipping" ? "Correo Argentino" : "Entrega CheTech"),
      address,
    ].filter(Boolean),
  };
}

function paymentBlock(order: OrderPayload) {
  const paid = order.payment_status === "approved";
  switch (order.payment_method) {
    case "mercadopago":
      return { label: "Pago", lines: ["Mercado Pago", paid ? "Pagado" : "Esperando el pago"] };
    case "transfer":
      return {
        label: "Pago",
        lines: [
          "Transferencia",
          paid
            ? "Acreditada"
            : order.transfer_reported_at
              ? "Avisaste que transferiste"
              : "Esperando la transferencia",
        ],
      };
    default:
      return { label: "Pago", lines: ["Al retirar", paid ? "Pagado" : "Lo pagás en el local"] };
  }
}

/** Etapas del pedido según cómo se paga y cómo se entrega. */
function stepsFor(order: OrderPayload) {
  if (order.delivery_method === "pickup" && order.payment_method === "pickup") {
    return ["Recibido", "Listo para retirar", "Retirado"];
  }
  if (order.delivery_method === "pickup")
    return ["Recibido", "Pagado", "Listo para retirar", "Retirado"];
  return ["Recibido", "Pagado", "En camino", "Entregado"];
}

function progress(
  order: OrderPayload,
  reached: "Recibido" | "Pagado" | "Listo para retirar" | "En camino",
) {
  const steps = stepsFor(order);
  return <Steps steps={steps} current={Math.max(0, steps.indexOf(reached))} />;
}

const reviewUrl =
  "https://www.google.com/maps/search/?api=1&query=CheTech+Independencia+784+Rio+Tercero";

export async function renderMail(
  kind: MailKind,
  order: OrderPayload,
  links: { order: string; admin: string },
): Promise<RenderedMail | null> {
  const hello = `Hola, ${firstName(order.customer_name)}:`;
  const site = mailSite();
  const customerReason = "Te escribimos por tu pedido en chetechstore.com.";
  const adminReason = "Aviso automático de la tienda para el local.";
  let subject = "";
  let preview = "";
  let kicker: string | undefined = `Pedido ${order.order_number}`;
  let purchase = true;
  let reason = customerReason;
  let body: React.ReactNode = null;

  switch (kind) {
    case "transfer_instructions": {
      subject = `Transferí ${money(order.total)} para confirmar tu pedido ${order.order_number}`;
      preview = `Te lo reservamos hasta el ${when(order.reserved_until)}. Acá tenés los datos para transferir.`;
      const transfer = order.transfer;
      body = (
        <>
          <Title>Te reservamos el pedido</Title>
          {progress(order, "Recibido")}
          <P>{hello}</P>
          <P>
            Para confirmarlo, transferí el monto exacto antes del{" "}
            <strong>{when(order.reserved_until)}</strong>. Si no llega a tiempo, los productos
            vuelven a la venta.
          </P>
          <Facts
            large="Monto"
            rows={[
              ["Monto", money(order.total)],
              ...((transfer?.alias ? [["Alias", transfer.alias]] : []) as [string, string][]),
              ...((transfer?.cvu ? [["CBU o CVU", transfer.cvu]] : []) as [string, string][]),
              ...((transfer?.holder ? [["Titular", transfer.holder]] : []) as [string, string][]),
              ...((transfer?.cuit ? [["CUIT", transfer.cuit]] : []) as [string, string][]),
              ...((transfer?.bank ? [["Banco o billetera", transfer.bank]] : []) as [
                string,
                string,
              ][]),
            ]}
          />
          <P>
            Cuando transfieras, avisanos desde el pedido. Lo confirmamos apenas veamos la
            acreditación.
          </P>
          <Button href={links.order}>Ya transferí</Button>
          {receipt(order)}
          <Details blocks={[deliveryBlock(order), paymentBlock(order)]} />
          <Help />
        </>
      );
      break;
    }
    case "order_received": {
      subject = `Recibimos tu pedido ${order.order_number}`;
      preview = "Te lo reservamos para que lo pagues al retirar. Te avisamos cuando esté listo.";
      body = (
        <>
          <Title>Recibimos tu pedido</Title>
          {progress(order, "Recibido")}
          <P>{hello}</P>
          <P>
            Te lo reservamos para que lo pagues al retirar en Independencia 784. Te avisamos por
            mail cuando esté listo: hasta ese aviso, no hace falta que vengas.
          </P>
          {receipt(
            order,
            order.reserved_until ? `Reservado hasta el ${when(order.reserved_until)}.` : undefined,
          )}
          <Details blocks={[deliveryBlock(order), paymentBlock(order)]} />
          <Button href={links.order}>Ver mi pedido</Button>
          <Help />
        </>
      );
      break;
    }
    case "payment_confirmed": {
      subject = `Pago confirmado: preparamos tu pedido ${order.order_number}`;
      preview =
        order.delivery_method === "pickup"
          ? "Ya tenemos tu pago. Te avisamos cuando esté listo para retirar."
          : "Ya tenemos tu pago. Te avisamos cuando salga, con el número de seguimiento.";
      body = (
        <>
          <Title>Pago confirmado</Title>
          {progress(order, "Pagado")}
          <P>{hello}</P>
          <P>
            Ya tenemos tu pago y estamos preparando el pedido.{" "}
            {order.delivery_method === "pickup"
              ? "Te avisamos por mail cuando esté listo para retirar."
              : "Te avisamos por mail cuando salga, con el número de seguimiento."}
          </P>
          {receipt(order)}
          <Details blocks={[deliveryBlock(order), paymentBlock(order)]} />
          <Button href={links.order}>Ver mi pedido</Button>
          <Help />
        </>
      );
      break;
    }
    case "ready_for_pickup": {
      const payAtPickup = order.payment_status !== "approved";
      subject = `Tu pedido ${order.order_number} está listo para retirar`;
      preview = `Código de retiro ${order.pickup_code ?? ""}. Te esperamos en Independencia 784.`;
      body = (
        <>
          <Title>Listo para retirar</Title>
          {progress(order, "Listo para retirar")}
          <P>{hello}</P>
          <P>
            Tu pedido te espera en Independencia 784, Río Tercero. Mostrá este código cuando vengas.
          </P>
          <Facts
            large="Código de retiro"
            rows={[
              ["Código de retiro", order.pickup_code ?? ""],
              ["Horario", pickupHours],
              ...((payAtPickup ? [["A pagar al retirar", money(order.total)]] : []) as [
                string,
                string,
              ][]),
            ]}
          />
          <P muted>Si lo retira otra persona, que traiga el código o el QR del pedido.</P>
          <Button href={links.order}>Ver el código y el QR</Button>
          {receipt(order)}
          <Help />
        </>
      );
      break;
    }
    case "shipped": {
      subject = `Tu pedido ${order.order_number} ya viaja`;
      preview = order.tracking_code
        ? `Número de seguimiento: ${order.tracking_code}.`
        : "Ya salió tu pedido.";
      body = (
        <>
          <Title>Tu pedido ya viaja</Title>
          {progress(order, "En camino")}
          <P>{hello}</P>
          <P>
            {order.delivery_method === "shipping"
              ? "Ya lo despachamos por Correo Argentino. Con este número podés seguirlo hasta tu casa."
              : "Ya salió con nuestra entrega. Te lo llevamos a la dirección del pedido."}
          </P>
          {order.tracking_code ? (
            <Facts large="Seguimiento" rows={[["Seguimiento", order.tracking_code]]} />
          ) : null}
          <Button href={order.tracking_url ?? links.order}>
            {order.tracking_url ? "Seguir el envío" : "Ver mi pedido"}
          </Button>
          <Details blocks={[deliveryBlock(order), paymentBlock(order)]} />
          {receipt(order)}
          <Help />
        </>
      );
      break;
    }
    case "reservation_reminder": {
      subject = `Tu reserva del pedido ${order.order_number} vence pronto`;
      preview = `Vence el ${when(order.reserved_until)}.`;
      body = (
        <>
          <Title>Tu reserva vence pronto</Title>
          {progress(order, "Recibido")}
          <P>{hello}</P>
          <P>
            La reserva de tu pedido vence el <strong>{when(order.reserved_until)}</strong>.{" "}
            {order.payment_method === "transfer"
              ? "Si ya transferiste, avisanos desde el pedido así lo confirmamos."
              : order.payment_method === "mercadopago"
                ? "Podés terminar el pago desde el pedido."
                : "Si no llegás a retirarlo, escribinos por WhatsApp y vemos."}
          </P>
          <Button href={links.order}>Ver mi pedido</Button>
          {receipt(order)}
          <Help />
        </>
      );
      break;
    }
    case "order_expired": {
      subject = `Venció la reserva del pedido ${order.order_number}`;
      preview =
        "Los productos volvieron a la venta. Si todavía los querés, podés pedirlos de nuevo.";
      purchase = false;
      body = (
        <>
          <Title>Venció la reserva</Title>
          <P>{hello}</P>
          <P>
            No recibimos el pago a tiempo y los productos volvieron a estar a la venta. No se te
            cobró nada. Si todavía los querés, podés hacer el pedido de nuevo.
          </P>
          {receipt(order)}
          <Button href={`${site}/productos`}>Volver a la tienda</Button>
          <Help />
        </>
      );
      break;
    }
    case "order_cancelled": {
      const note = order.history.at(-1)?.note;
      subject = `Cancelamos tu pedido ${order.order_number}`;
      preview = note ?? "Cancelamos tu pedido.";
      body = (
        <>
          <Title>Cancelamos tu pedido</Title>
          <P>{hello}</P>
          <P>{note ?? "Cancelamos tu pedido."}</P>
          <P>No se te cobró nada.</P>
          {receipt(order)}
          <Help />
        </>
      );
      break;
    }
    case "review_request": {
      subject = "¿Qué tal tu compra?";
      preview = "Tu opinión ayuda a otros vecinos de Río Tercero a elegir.";
      kicker = undefined;
      purchase = false;
      reason =
        "Te escribimos una sola vez por tu compra en chetechstore.com. No te vamos a mandar publicidad.";
      body = (
        <>
          <Title>¿Qué tal tu compra?</Title>
          <P>{hello}</P>
          <P>
            Gracias por comprar en CheTech. Si te gustó la atención, una reseña en Google nos ayuda
            muchísimo: es lo que miran otros vecinos antes de traernos su tele.
          </P>
          <Button href={reviewUrl}>Dejar una reseña</Button>
          <Help>
            ¿Algo no salió bien? Contanos respondiendo este mail o por{" "}
            <a href="https://wa.me/5493571544683" style={{ color: "#101010", fontWeight: 700 }}>
              WhatsApp
            </a>{" "}
            y lo resolvemos.
          </Help>
        </>
      );
      break;
    }
    case "admin_new_order": {
      const payment = {
        mercadopago: "Mercado Pago",
        transfer: "Transferencia",
        pickup: "Pago al retirar",
      }[order.payment_method ?? "pickup"];
      subject = `Pedido nuevo ${order.order_number}: ${money(order.total)}, ${payment?.toLowerCase()}`;
      preview = `${order.customer_name}, ${order.delivery_option?.label ?? "retiro en el local"}.`;
      purchase = false;
      reason = adminReason;
      kicker = "Para el local";
      body = (
        <>
          <Title>Pedido nuevo</Title>
          <Facts
            rows={[
              ["Cliente", order.customer_name],
              ["WhatsApp", order.customer_phone],
              ["Mail", order.customer_email],
              ["Entrega", order.delivery_option?.label ?? "Retiro en el local"],
              ...((order.delivery_method !== "pickup" && order.shipping_address
                ? [["Dirección", addressLine(order.shipping_address)]]
                : []) as [string, string][]),
              ["Pago", payment ?? ""],
            ]}
          />
          <Button href={links.admin}>Abrir en Administración</Button>
          {receipt(order)}
        </>
      );
      break;
    }
    case "admin_transfer_reported": {
      subject = `${order.customer_name} avisó que transfirió: ${order.order_number}`;
      preview = `Confirmá ${money(order.total)} cuando veas la acreditación.`;
      purchase = false;
      reason = adminReason;
      kicker = "Para el local";
      body = (
        <>
          <Title>Avisaron una transferencia</Title>
          <P>
            {order.customer_name} avisó que transfirió <strong>{money(order.total)}</strong> por el
            pedido {order.order_number}. Cuando veas la acreditación, confirmalo en Administración:
            recién ahí le llega el mail de pago confirmado.
          </P>
          <Button href={links.admin}>Confirmar el pago</Button>
          {receipt(order)}
        </>
      );
      break;
    }
    case "admin_attention": {
      subject = `Revisá el pedido ${order.order_number}: hay que devolver un pago`;
      preview = "Pagaron después de que venció la reserva y el producto ya no tiene stock.";
      purchase = false;
      reason = adminReason;
      kicker = "Para el local";
      body = (
        <>
          <Title>Un pedido necesita revisión</Title>
          <P>
            {order.customer_name} pagó <strong>{money(order.total)}</strong> por el pedido{" "}
            {order.order_number} después de que venció la reserva, y el producto ya no tiene stock.
            En su pedido figura que le vamos a devolver el dinero: hacé la devolución y cancelá el
            pedido en Administración.
          </P>
          <Button href={links.admin}>Abrir el pedido</Button>
          {receipt(order)}
        </>
      );
      break;
    }
    default:
      return null;
  }

  const element = (
    <MailLayout preview={preview} kicker={kicker} reason={reason} purchase={purchase}>
      {body}
    </MailLayout>
  );
  const html = await render(element);
  const text = toPlainText(html);
  return { subject, html, text };
}
