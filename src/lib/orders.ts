export const orderStatusLabels: Record<string, string> = {
  pending_whatsapp: "Pendiente de envío por WhatsApp",
  pending_confirmation: "Pendiente de confirmación",
  confirmed: "Confirmado",
  awaiting_payment: "Pendiente de pago",
  paid: "Pagado",
  preparing: "En preparación",
  shipped: "Enviado",
  ready_for_pickup: "Listo para retirar",
  completed: "Completado",
  cancelled: "Cancelado",
};

export const deliveryMethodLabels: Record<string, string> = {
  shipping: "Envío",
  pickup: "Retiro en el local",
  coordinate: "A coordinar",
};

export const orderStatuses = Object.keys(orderStatusLabels);
