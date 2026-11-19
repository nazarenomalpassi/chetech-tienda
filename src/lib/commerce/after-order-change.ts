import "server-only";

import { reportPurchaseToMeta } from "@/lib/commerce/meta-capi";
import { processOutbox } from "@/lib/mail/outbox";

/**
 * Tareas que siguen a un cambio en un pedido: mandar los mails en cola e informar la compra a Meta si se
 * cobró. Corre después de responder (con after) y nunca tira errores hacia afuera.
 */
export async function afterOrderChange(orderId?: string | null) {
  await processOutbox(10).catch((cause) => console.error("Cola de mails", cause));
  if (orderId) await reportPurchaseToMeta(orderId).catch((cause) => console.error("Meta", cause));
}
