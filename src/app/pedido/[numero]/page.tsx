import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { OrderActions } from "@/components/store/order/order-actions";
import { siteConfig } from "@/config/site";
import { getCustomerOrder } from "@/lib/commerce/customer-order";
import { formatDateTime, formatPrice } from "@/lib/format";
import { deliveryMethodLabels, orderStatusLabels, orderSteps, paymentMethodLabels } from "@/lib/orders";
import { whatsappUrl } from "@/lib/whatsapp";
import styles from "./order.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu pedido",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ numero: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OrderPage({ params, searchParams }: Props) {
  const { numero } = await params;
  const query = await searchParams;
  const token = typeof query.t === "string" ? query.t : null;
  const paymentId = typeof query.payment_id === "string" ? query.payment_id : null;
  const order = await getCustomerOrder(decodeURIComponent(numero), token);

  if (!order) {
    return (
      <div className={`page ${styles.missing}`}>
        <h1>No encontramos ese pedido</h1>
        <p>
          Abrilo desde el enlace del mail que te mandamos o ingresá con tu cuenta. Si no lo encontrás, escribinos y lo
          buscamos con tu nombre.
        </p>
        <div className={styles.missingActions}>
          <Link href="/ingresar" className="btn">
            Ingresar
          </Link>
          <a className="btn" data-variant="whatsapp" href={whatsappUrl(`Hola, no encuentro mi pedido ${numero}.`)} target="_blank" rel="noreferrer">
            Escribir por WhatsApp
          </a>
        </div>
      </div>
    );
  }

  const { steps, current, closed } = orderSteps(order);
  const qr = await QRCode.toString(`${siteConfig.baseUrl}/admin/pedidos?buscar=${order.order_number}`, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#101010", light: "#ffffff" },
  });
  const awaiting = order.status === "awaiting_payment";
  const headline =
    order.status === "awaiting_payment"
      ? order.payment_method === "transfer"
        ? "Te reservamos el pedido"
        : order.payment_method === "pickup"
          ? "Recibimos tu pedido"
          : "Falta el pago"
      : order.status === "paid"
        ? "¡Gracias! Ya tenemos tu pago"
        : order.status === "ready_for_pickup"
          ? "Listo para retirar"
          : order.status === "completed"
            ? "Pedido entregado"
            : orderStatusLabels[order.status] ?? "Tu pedido";

  return (
    <div className={`page ${styles.page}`}>
      <div className={styles.layout}>
        <div className={styles.main}>
          <p className={styles.number}>Pedido {order.order_number}</p>
          <h1>{headline}</h1>

          {!closed ? (
            <ol className={styles.steps} aria-label="Estado del pedido">
              {steps.map((step, index) => (
                <li key={step.key} data-state={index < current ? "done" : index === current ? "current" : "next"}>
                  <span aria-hidden />
                  {step.label}
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.closed}>{order.history.at(-1)?.note ?? orderStatusLabels[order.status]}</p>
          )}

          <OrderActions order={order} token={token} paymentId={paymentId} notice={typeof query.aviso === "string" ? query.aviso : null} />

          {order.status === "ready_for_pickup" && order.pickup_code ? (
            <div className={styles.pickup}>
              <p>Código de retiro</p>
              <p className={styles.pickupCode}>{order.pickup_code}</p>
              <p>
                Mostralo en {siteConfig.address}.{" "}
                {order.payment_status !== "approved" ? `Pagás ${formatPrice(order.total)} al retirar.` : ""}
              </p>
            </div>
          ) : null}

          {order.tracking_code ? (
            <div className={styles.tracking}>
              <p>Seguimiento: {order.tracking_code}</p>
              {order.tracking_url ? (
                <a href={order.tracking_url} target="_blank" rel="noreferrer" className="btn" data-variant="secondary">
                  Seguir el envío
                </a>
              ) : null}
            </div>
          ) : null}

          <section className={styles.history} aria-labelledby="historial">
            <h2 id="historial">Novedades</h2>
            <ol>
              {[...order.history].reverse().map((entry) => (
                <li key={`${entry.at}-${entry.status}`}>
                  <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                  <span>{entry.note ?? orderStatusLabels[entry.status]}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* E11 · Comprobante: baja como papel que sale de una impresora y aparece el QR */}
        <aside className={styles.receipt} aria-labelledby="comprobante">
          <div className={styles.paper}>
            <div className="barras" aria-hidden />
            <div className={styles.receiptHead}>
              <Image src="/brand/chetech-logo-tinta.svg" alt="CheTech" width={120} height={21} />
              <p id="comprobante">Comprobante de pedido</p>
            </div>
            <dl className={styles.meta}>
              <div>
                <dt>Pedido</dt>
                <dd>{order.order_number}</dd>
              </div>
              <div>
                <dt>Fecha</dt>
                <dd>{formatDateTime(order.created_at)}</dd>
              </div>
              <div>
                <dt>A nombre de</dt>
                <dd>{order.customer_name}</dd>
              </div>
              <div>
                <dt>Entrega</dt>
                <dd>{order.delivery_option?.label ?? deliveryMethodLabels[order.delivery_method]}</dd>
              </div>
              <div>
                <dt>Pago</dt>
                <dd>{order.payment_method ? paymentMethodLabels[order.payment_method] : "A coordinar"}</dd>
              </div>
            </dl>
            <ul className={styles.lines}>
              {order.items.map((item) => (
                <li key={item.sku}>
                  <span>
                    {item.quantity} x {item.name}
                  </span>
                  <span className="price">{formatPrice(item.subtotal)}</span>
                </li>
              ))}
              {order.shipping_cost > 0 ? (
                <li>
                  <span>Envío</span>
                  <span className="price">{formatPrice(order.shipping_cost)}</span>
                </li>
              ) : null}
            </ul>
            <p className={styles.total}>
              <span>Total</span>
              <span className="price">{formatPrice(order.total)}</span>
            </p>
            <div className={styles.qr} aria-hidden dangerouslySetInnerHTML={{ __html: qr }} />
            <p className={styles.qrNote}>Mostrá este código en el local</p>
            {awaiting && order.reserved_until ? (
              <p className={styles.reserve}>Reservado hasta el {formatDateTime(order.reserved_until)}</p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
