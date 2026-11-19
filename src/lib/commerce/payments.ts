import "server-only";

import {
  createPreference,
  getPayment,
  mapPaymentStatus,
  mercadoPagoConfig,
  paymentProblem,
} from "@/lib/commerce/mercadopago";
import { accessTokenFor } from "@/lib/commerce/tokens";
import type { OrderPayload } from "@/lib/commerce/types";
import { createServiceClient } from "@/lib/supabase/service";

/** Consulta un pago en Mercado Pago y, si todo coincide, lo aplica al pedido. Es idempotente. */
export async function applyMercadoPagoPayment(paymentId: string) {
  const config = mercadoPagoConfig();
  const service = createServiceClient();
  if (!config || !service) return { ok: false as const, reason: "Mercado Pago no está configurado." };

  const payment = await getPayment(config, paymentId);
  const { data: order } = await service.rpc("storefront_order_by_number_internal", {
    p_order_number: payment.externalReference,
  });
  if (!order) return { ok: false as const, reason: "El pago no corresponde a ningún pedido." };
  const payload = order as OrderPayload;

  const problem = paymentProblem(payment, payload, config);
  if (problem) {
    console.error("Pago de Mercado Pago rechazado por control", payload.order_number, problem);
    return { ok: false as const, reason: problem };
  }

  const { data, error } = await service.rpc("storefront_apply_payment", {
    p_order_id: payload.id,
    p_provider: "mercadopago",
    p_provider_payment_id: payment.id,
    p_status: mapPaymentStatus(payment.status),
    p_status_detail: payment.statusDetail.slice(0, 120),
    p_amount: payment.amount,
    p_currency: payment.currency,
  });
  if (error) throw new Error(`No se pudo aplicar el pago: ${error.message}`);
  return { ok: true as const, order: payload, result: data as { applied: boolean; status: string } };
}

/** Abre (o vuelve a abrir) la orden de cobro de Mercado Pago de un pedido que espera el pago. */
export async function startMercadoPagoCheckout(order: OrderPayload) {
  const config = mercadoPagoConfig();
  const service = createServiceClient();
  if (!config || !service) throw new Error("Mercado Pago no está configurado.");
  if (order.status !== "awaiting_payment" || order.payment_method !== "mercadopago") {
    throw new Error("Este pedido no espera un pago con Mercado Pago.");
  }
  const expiresAt = order.reserved_until ?? new Date(Date.now() + 30 * 60_000).toISOString();
  const preference = await createPreference(config, {
    orderId: order.id,
    orderNumber: order.order_number,
    accessToken: accessTokenFor(order.id),
    items: order.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      image: item.image,
    })),
    shippingCost: order.shipping_cost,
    payerEmail: order.customer_email,
    payerName: order.customer_name,
    expiresAt: new Date(expiresAt).toISOString(),
  });
  await service.rpc("storefront_set_preference", { p_order_id: order.id, p_preference_id: preference.id });
  return preference.url;
}
