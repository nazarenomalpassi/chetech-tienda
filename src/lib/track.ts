// Eventos de compra para Google Analytics 4 y el píxel de Meta. Si no hay permiso del visitante
// o no están configurados, no hace nada.

type Item = { id: string; name: string; price: number; quantity?: number; family?: string };

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

export function trackEvent(
  name: "view_item" | "add_to_cart" | "begin_checkout" | "purchase" | "search",
  data: { items?: Item[]; value?: number; transactionId?: string; searchTerm?: string } = {},
) {
  if (typeof window === "undefined") return;
  const items = (data.items ?? []).map((item) => ({
    item_id: item.id,
    item_name: item.name,
    item_category: item.family,
    price: item.price,
    quantity: item.quantity ?? 1,
  }));
  window.gtag?.("event", name, {
    currency: "ARS",
    value: data.value,
    transaction_id: data.transactionId,
    search_term: data.searchTerm,
    items,
  });
  const metaEvents: Record<string, string> = {
    view_item: "ViewContent",
    add_to_cart: "AddToCart",
    begin_checkout: "InitiateCheckout",
    purchase: "Purchase",
    search: "Search",
  };
  window.fbq?.(
    "track",
    metaEvents[name],
    {
      currency: "ARS",
      value: data.value,
      content_type: "product",
      content_ids: (data.items ?? []).map((item) => item.id),
      search_string: data.searchTerm,
    },
    data.transactionId ? { eventID: data.transactionId } : undefined,
  );
}
