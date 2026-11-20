// Todos los mails de la tienda armados con datos de ejemplo, para verlos en Administración → Mails y
// mandarse una prueba. Los datos son inventados salvo los productos, que se toman del catálogo real si se
// pasan (así la prueba muestra fotos de verdad).
import type { OrderPayload } from "@/lib/commerce/types";
import { authTemplates, renderAuthTemplate, type AuthTemplate } from "@/lib/mail/auth-templates";
import { mailSite } from "@/lib/mail/layout";
import { renderNotice, type NoticeKind } from "@/lib/mail/notices";
import { renderMail, type MailKind } from "@/lib/mail/templates";

export type MailGroup = "Cuenta" | "Compra" | "Avisos" | "Para el local";

export type MailSample = {
  id: string;
  group: MailGroup;
  /** Nombre corto, para la lista. */
  label: string;
  /** Cuándo sale, en palabras. */
  trigger: string;
  subject: string;
  html: string;
  text: string;
};

export type SampleProduct = {
  name: string;
  price: number;
  image: string | null;
  slug: string | null;
};

const fallbackProducts: SampleProduct[] = [
  { name: "ONN 4K Streaming Box", price: 150000, image: null, slug: null },
  { name: "Cable HDMI 2.0 de 1,5 m", price: 9000, image: null, slug: null },
];

const authInfo: Record<AuthTemplate, { label: string; trigger: string }> = {
  confirmacion: { label: "Confirmar mail", trigger: "Cuando alguien crea una cuenta." },
  recuperacion: {
    label: "Cambiar contraseña",
    trigger: "Cuando alguien toca “Olvidé mi contraseña”.",
  },
  invitacion: {
    label: "Invitación",
    trigger: "Cuando se crea una cuenta desde Administración o la gestión.",
  },
  "enlace-magico": {
    label: "Entrar sin contraseña",
    trigger: "Cuando alguien pide un enlace para entrar.",
  },
  "cambio-de-mail": {
    label: "Cambio de mail",
    trigger: "Cuando alguien cambia el mail de su cuenta.",
  },
};

const orderInfo: Record<MailKind, { label: string; trigger: string; group: MailGroup }> = {
  order_received: {
    label: "Pedido recibido",
    trigger: "Al hacer un pedido para pagar al retirar.",
    group: "Compra",
  },
  transfer_instructions: {
    label: "Datos para transferir",
    trigger: "Al hacer un pedido para pagar por transferencia.",
    group: "Compra",
  },
  payment_confirmed: {
    label: "Pago confirmado",
    trigger: "Cuando se acredita Mercado Pago o confirmás una transferencia.",
    group: "Compra",
  },
  ready_for_pickup: {
    label: "Listo para retirar",
    trigger: "Cuando marcás el pedido como listo en Administración.",
    group: "Compra",
  },
  shipped: {
    label: "Pedido enviado",
    trigger: "Cuando cargás el envío y el seguimiento en Administración.",
    group: "Compra",
  },
  reservation_reminder: {
    label: "La reserva vence pronto",
    trigger:
      "3 horas antes de que venza la reserva, si todavía no se pagó (transferencia o pago al retirar).",
    group: "Compra",
  },
  order_expired: {
    label: "Venció la reserva",
    trigger: "Cuando vence la reserva sin pago.",
    group: "Compra",
  },
  order_cancelled: {
    label: "Pedido cancelado",
    trigger: "Cuando cancelás un pedido en Administración.",
    group: "Compra",
  },
  review_request: {
    label: "Pedido de reseña",
    trigger: "3 días después de entregado, una sola vez.",
    group: "Compra",
  },
  admin_new_order: {
    label: "Pedido nuevo",
    trigger: "Cada vez que entra un pedido.",
    group: "Para el local",
  },
  admin_transfer_reported: {
    label: "Avisaron una transferencia",
    trigger: "Cuando un cliente avisa que transfirió.",
    group: "Para el local",
  },
  admin_attention: {
    label: "Pago para devolver",
    trigger: "Si pagan después de vencida la reserva y ya no hay stock.",
    group: "Para el local",
  },
};

const noticeInfo: Record<NoticeKind, { label: string; trigger: string; group: MailGroup }> = {
  back_in_stock: {
    label: "Ya entró lo que esperabas",
    trigger: "Cuando se publica lo que alguien pidió en la lista de espera.",
    group: "Avisos",
  },
  consumer_request_received: {
    label: "Constancia de solicitud",
    trigger: "Cuando alguien manda un arrepentimiento o un pedido de privacidad.",
    group: "Avisos",
  },
  admin_waitlist: {
    label: "Alguien pidió aviso",
    trigger: "Cuando alguien se anota en la lista de espera.",
    group: "Para el local",
  },
  admin_consumer_request: {
    label: "Solicitud nueva",
    trigger: "Cuando entra un arrepentimiento o un pedido de privacidad.",
    group: "Para el local",
  },
};

function baseOrder(products: SampleProduct[]): OrderPayload {
  const [first, second] = [
    products[0] ?? fallbackProducts[0],
    products[1] ?? products[0] ?? fallbackProducts[1],
  ];
  const items = [
    {
      name: first.name,
      sku: "EJ-1",
      quantity: 1,
      unit_price: first.price,
      subtotal: first.price,
      image: first.image,
      slug: first.slug,
    },
    {
      name: second.name,
      sku: "EJ-2",
      quantity: 2,
      unit_price: second.price,
      subtotal: second.price * 2,
      image: second.image,
      slug: second.slug,
    },
  ];
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const created = new Date(Date.now() - 20 * 60_000).toISOString();
  return {
    id: "00000000-0000-4000-8000-000000000000",
    order_number: "CHT-000128",
    status: "awaiting_payment",
    payment_method: "pickup",
    payment_status: "pending",
    delivery_method: "pickup",
    delivery_option: { kind: "pickup", label: "Retiro en Independencia 784" },
    shipping_address: null,
    customer_name: "Laura Gómez",
    customer_email: "laura@ejemplo.com",
    customer_phone: "3571 15 123456",
    subtotal,
    shipping_cost: 0,
    discount_total: 0,
    coupon_code: null,
    discount_detail: null,
    total: subtotal,
    reserved_until: new Date(Date.now() + 26 * 3600_000).toISOString(),
    paid_at: null,
    ready_at: null,
    shipped_at: null,
    delivered_at: null,
    pickup_code: "4821",
    tracking_code: null,
    tracking_url: null,
    transfer_reported_at: null,
    created_at: created,
    is_guest: true,
    items,
    history: [],
    transfer: null,
  };
}

function orderFor(kind: MailKind, products: SampleProduct[]): OrderPayload {
  const order = baseOrder(products);
  const paidOnline = {
    payment_method: "mercadopago" as const,
    payment_status: "approved",
    paid_at: order.created_at,
  };
  switch (kind) {
    case "transfer_instructions":
    case "admin_transfer_reported":
      return {
        ...order,
        payment_method: "transfer",
        transfer: {
          alias: "chetech.ejemplo",
          cvu: "0000003100000000000000",
          holder: "Titular de ejemplo",
          cuit: "20-00000000-0",
          bank: "Banco de ejemplo",
        },
        transfer_reported_at: kind === "admin_transfer_reported" ? new Date().toISOString() : null,
      };
    case "reservation_reminder":
      return {
        ...order,
        payment_method: "transfer",
        reserved_until: new Date(Date.now() + 3 * 3600_000).toISOString(),
      };
    case "payment_confirmed":
    case "ready_for_pickup":
      return {
        ...order,
        ...paidOnline,
        status: kind === "ready_for_pickup" ? "ready_for_pickup" : "paid",
      };
    case "shipped": {
      const shipping = 7500;
      return {
        ...order,
        ...paidOnline,
        status: "shipped",
        delivery_method: "shipping",
        delivery_option: { kind: "shipping", label: "Correo Argentino" },
        shipping_address: {
          street: "Av. San Martín",
          number: "1250",
          apartment: "",
          city: "Córdoba",
          province: "Córdoba",
          postal_code: "5000",
        },
        shipping_cost: shipping,
        total: order.subtotal + shipping,
        tracking_code: "TN123456789AR",
        tracking_url: "https://www.correoargentino.com.ar/formularios/e-commerce",
      };
    }
    case "order_expired":
      return { ...order, status: "expired" };
    case "order_cancelled":
      return {
        ...order,
        status: "cancelled",
        history: [
          {
            status: "cancelled",
            note: "No pudimos conseguir el producto a tiempo. Disculpá las molestias.",
            at: new Date().toISOString(),
          },
        ],
      };
    case "admin_attention":
      return { ...order, ...paidOnline, status: "expired" };
    default:
      return order;
  }
}

/** Arma los 21 mails con datos de ejemplo. */
export async function renderMailSamples(products: SampleProduct[] = []): Promise<MailSample[]> {
  const site = mailSite();
  const usable = products.filter((product) => product.price > 0).slice(0, 2);
  const samples: MailSample[] = [];

  for (const kind of Object.keys(authTemplates) as AuthTemplate[]) {
    const html = (await renderAuthTemplate(kind))
      .replaceAll("{{ .ConfirmationURL }}", `${site}/ingresar`)
      .replaceAll("{{ .Email }}", "laura@ejemplo.com");
    samples.push({
      id: `cuenta-${kind}`,
      group: "Cuenta",
      ...authInfo[kind],
      subject: authTemplates[kind].subject,
      html,
      text: "",
    });
  }

  const links = { order: `${site}/pedido/CHT-000128`, admin: `${site}/admin/pedidos` };
  for (const kind of Object.keys(orderInfo) as MailKind[]) {
    const mail = await renderMail(kind, orderFor(kind, usable), links);
    if (mail)
      samples.push({
        id: `compra-${kind}`,
        ...orderInfo[kind],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
  }

  const product = usable[0] ?? fallbackProducts[0];
  for (const kind of Object.keys(noticeInfo) as NoticeKind[]) {
    const mail = await renderNotice(
      kind,
      {
        name: "Laura Gómez",
        subject: kind === "admin_waitlist" ? "Placa para 32LB561B" : product.name,
        productName: product.name,
        productPath: product.slug ? `/productos/${product.slug}` : "/productos",
        productPrice: product.price,
        productImage: product.image ?? undefined,
        reference: "CHT-ARR-000012",
        requestType: "withdrawal",
        contact: "laura@ejemplo.com",
        createdAt: new Date().toISOString(),
      },
      site,
    );
    if (mail)
      samples.push({
        id: `aviso-${kind}`,
        ...noticeInfo[kind],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
  }

  const order: MailGroup[] = ["Compra", "Cuenta", "Avisos", "Para el local"];
  return samples.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}
