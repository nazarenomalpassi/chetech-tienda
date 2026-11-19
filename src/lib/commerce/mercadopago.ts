// Mercado Pago Checkout Pro: crea la orden de cobro, valida la firma de los avisos y consulta el pago.
// Un pedido pasa a pagado solo cuando el servidor consulta el pago y comprueba monto, moneda, cuenta
// receptora y número de pedido. La pantalla de regreso nunca marca un pedido como pagado.
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.mercadopago.com";

export type MercadoPagoConfig = {
  accessToken: string;
  webhookSecret?: string;
  collectorId?: string;
  siteUrl: string;
  /** Interruptor aparte para el dinero real: hasta que no se activa, solo se aceptan pagos de prueba. */
  liveEnabled: boolean;
};

export function mercadoPagoConfig(): MercadoPagoConfig | null {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) return null;
  return {
    accessToken,
    webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
    collectorId: process.env.MERCADOPAGO_COLLECTOR_ID,
    siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    liveEnabled: process.env.PAYMENTS_LIVE_ENABLED === "true",
  };
}

export type PreferenceInput = {
  orderId: string;
  orderNumber: string;
  accessToken: string;
  items: { sku: string; name: string; quantity: number; unitPrice: number; image?: string | null }[];
  shippingCost: number;
  /** Descuento total del pedido. Mercado Pago no acepta renglones negativos. */
  discountTotal?: number;
  payerEmail: string;
  payerName: string;
  expiresAt: string;
};

export function buildPreference(config: MercadoPagoConfig, input: PreferenceInput) {
  const orderUrl = `${config.siteUrl}/pedido/${encodeURIComponent(input.orderNumber)}?t=${encodeURIComponent(input.accessToken)}`;
  const discount = input.discountTotal ?? 0;
  const productsTotal = input.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  // Con descuento, los productos van en un solo renglón por el importe ya descontado:
  // así lo que cobra Mercado Pago coincide al centavo con el total del pedido.
  const items =
    discount > 0
      ? [
          {
            id: input.orderNumber.slice(0, 60),
            title: `Pedido ${input.orderNumber} (${input.items.reduce((sum, item) => sum + item.quantity, 0)} productos, con descuento)`.slice(0, 120),
            quantity: 1,
            unit_price: Number(Math.max(productsTotal - discount, 0).toFixed(2)),
            currency_id: "ARS",
            picture_url: input.items[0]?.image ?? undefined,
          },
        ]
      : input.items.map((item) => ({
          id: item.sku.slice(0, 60),
          title: item.name.slice(0, 120),
          quantity: item.quantity,
          unit_price: Number(item.unitPrice.toFixed(2)),
          currency_id: "ARS",
          picture_url: item.image ?? undefined,
        }));
  if (input.shippingCost > 0) {
    items.push({
      id: "envio",
      title: "Envío",
      quantity: 1,
      unit_price: Number(input.shippingCost.toFixed(2)),
      currency_id: "ARS",
      picture_url: undefined,
    });
  }
  const [firstName, ...rest] = input.payerName.trim().split(/\s+/);
  return {
    items,
    payer: { email: input.payerEmail, name: firstName, surname: rest.join(" ") || undefined },
    external_reference: input.orderNumber,
    metadata: { order_id: input.orderId, order_number: input.orderNumber },
    notification_url: `${config.siteUrl}/api/payments/mercadopago/webhook?source_news=webhooks`,
    back_urls: { success: orderUrl, pending: orderUrl, failure: orderUrl },
    auto_return: "approved",
    statement_descriptor: "CHETECH",
    expires: true,
    expiration_date_to: input.expiresAt,
    binary_mode: false,
  };
}

async function mpFetch(config: MercadoPagoConfig, path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Mercado Pago respondió ${response.status}: ${String(body.message ?? body.error ?? "error")}`);
  }
  return body;
}

export async function createPreference(config: MercadoPagoConfig, input: PreferenceInput) {
  const body = await mpFetch(config, "/checkout/preferences", {
    method: "POST",
    body: JSON.stringify(buildPreference(config, input)),
    headers: { "X-Idempotency-Key": `pref-${input.orderId}-${input.expiresAt}` },
  });
  const url = String(config.liveEnabled ? body.init_point : (body.sandbox_init_point ?? body.init_point));
  return { id: String(body.id), url };
}

export type MercadoPagoPayment = {
  id: string;
  status: string;
  statusDetail: string;
  amount: number;
  currency: string;
  externalReference: string;
  collectorId: string;
  liveMode: boolean;
};

export async function getPayment(config: MercadoPagoConfig, paymentId: string): Promise<MercadoPagoPayment> {
  if (!/^\d{1,20}$/.test(paymentId)) throw new Error("Identificador de pago inválido");
  const body = await mpFetch(config, `/v1/payments/${paymentId}`);
  return {
    id: String(body.id),
    status: String(body.status ?? ""),
    statusDetail: String(body.status_detail ?? ""),
    amount: Number(body.transaction_amount ?? 0),
    currency: String(body.currency_id ?? ""),
    externalReference: String(body.external_reference ?? ""),
    collectorId: String(body.collector_id ?? (body.collector as { id?: unknown } | undefined)?.id ?? ""),
    liveMode: Boolean(body.live_mode),
  };
}

/** Estados de Mercado Pago que entiende la base. */
export function mapPaymentStatus(status: string) {
  switch (status) {
    case "approved":
      return "approved";
    case "authorized":
    case "in_process":
    case "in_mediation":
      return "in_process";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    case "refunded":
      return "refunded";
    case "charged_back":
      return "charged_back";
    default:
      return "pending";
  }
}

/**
 * Valida la firma x-signature de un aviso de Mercado Pago.
 * Plantilla oficial: id:[data.id];request-id:[x-request-id];ts:[ts];
 */
export function verifySignature(options: {
  signature: string | null;
  requestId: string | null;
  dataId: string;
  secret: string;
  now?: number;
  toleranceSeconds?: number;
}) {
  if (!options.signature) return false;
  const parts = Object.fromEntries(
    options.signature.split(",").map((part) => {
      const [key, ...value] = part.split("=");
      return [key.trim(), value.join("=").trim()];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  const tolerance = options.toleranceSeconds ?? 600;
  const tsSeconds = Number(ts.length > 10 ? Number(ts) / 1000 : ts);
  const now = (options.now ?? Date.now()) / 1000;
  if (!Number.isFinite(tsSeconds) || Math.abs(now - tsSeconds) > tolerance) return false;
  const id = /^[a-z0-9]+$/i.test(options.dataId) ? options.dataId.toLowerCase() : options.dataId;
  let manifest = `id:${id};`;
  if (options.requestId) manifest += `request-id:${options.requestId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac("sha256", options.secret).update(manifest).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1.toLowerCase(), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Controles antes de aplicar un pago a un pedido. Devuelve el motivo si algo no coincide. */
export function paymentProblem(
  payment: MercadoPagoPayment,
  order: { order_number: string; total: number },
  config: Pick<MercadoPagoConfig, "collectorId" | "liveEnabled">,
) {
  if (payment.externalReference !== order.order_number) return "El pago corresponde a otro pedido.";
  if (payment.currency !== "ARS") return "El pago no está en pesos.";
  if (config.collectorId && payment.collectorId && payment.collectorId !== config.collectorId)
    return "El pago fue a otra cuenta de Mercado Pago.";
  if (payment.liveMode && !config.liveEnabled) return "Llegó un pago real con los pagos reales desactivados.";
  return null;
}
