export const orderStatusLabels: Record<string, string> = {
  pending_whatsapp: "Pendiente de envío por WhatsApp",
  pending_confirmation: "Pendiente de confirmación",
  confirmed: "Confirmado",
  awaiting_payment: "Esperando pago",
  paid: "Pagado",
  preparing: "En preparación",
  shipped: "Despachado",
  ready_for_pickup: "Listo para retirar",
  completed: "Entregado",
  cancelled: "Cancelado",
  expired: "Vencido",
  returned: "Devuelto",
};

export const deliveryMethodLabels: Record<string, string> = {
  shipping: "Correo Argentino",
  pickup: "Retiro en el local",
  coordinate: "A coordinar",
  local_delivery: "Entrega CheTech",
};

export const paymentMethodLabels: Record<string, string> = {
  mercadopago: "Mercado Pago",
  transfer: "Transferencia",
  pickup: "Pago al retirar",
};

export const paymentStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  in_process: "En revisión",
  approved: "Aprobado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
  refunded: "Devuelto",
  charged_back: "Contracargo",
};

// Estados que Administración puede elegir a mano en los pedidos del circuito anterior (WhatsApp).
export const orderStatuses = [
  "pending_whatsapp",
  "pending_confirmation",
  "confirmed",
  "awaiting_payment",
  "paid",
  "preparing",
  "shipped",
  "ready_for_pickup",
  "completed",
  "cancelled",
];

/** Pasos visibles para el cliente, en orden. */
export function orderSteps(order: { status: string; delivery_method: string; payment_method: string | null }) {
  const lastStep = order.delivery_method === "pickup" ? "Listo para retirar" : "Despachado";
  const steps = [
    { key: "received", label: "Pedido recibido" },
    { key: "paid", label: order.payment_method === "pickup" ? "Se paga al retirar" : "Pago confirmado" },
    { key: "preparing", label: "En preparación" },
    { key: "ready", label: lastStep },
    { key: "delivered", label: "Entregado" },
  ];
  const position: Record<string, number> = {
    awaiting_payment: 0,
    paid: 1,
    preparing: 2,
    ready_for_pickup: 3,
    shipped: 3,
    completed: 4,
  };
  const current = position[order.status] ?? -1;
  return { steps, current, closed: ["cancelled", "expired", "returned"].includes(order.status) };
}
