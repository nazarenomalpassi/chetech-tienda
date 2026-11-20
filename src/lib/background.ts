import "server-only";

import { processOutbox } from "@/lib/mail/outbox";
import { notifyWaitlist } from "@/lib/waitlist";

// Tareas de fondo que no tienen quién las dispare: la base encola recordatorios (reserva por vencer,
// pedido vencido, pedir la reseña) con su reloj, pero los mails los manda la tienda. Mientras entra
// gente, cada tanto se vacía la cola y se revisa la lista de espera. El freno es por réplica y en
// memoria: alcanza porque la tienda corre con una sola.
const OUTBOX_EVERY_MS = 60_000;
const WAITLIST_EVERY_MS = 10 * 60_000;

let lastOutbox = 0;
let lastWaitlist = 0;

export async function runBackgroundWork() {
  const now = Date.now();
  try {
    if (now - lastWaitlist >= WAITLIST_EVERY_MS) {
      lastWaitlist = now;
      await notifyWaitlist();
    }
    if (now - lastOutbox >= OUTBOX_EVERY_MS) {
      lastOutbox = now;
      await processOutbox(10);
    }
  } catch (cause) {
    console.error("Tareas de fondo", cause);
  }
}
