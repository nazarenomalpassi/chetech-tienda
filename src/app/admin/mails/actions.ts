"use server";

import { requireAdmin } from "@/lib/auth";
import { mailEnabled, sendMail } from "@/lib/mail/outbox";
import { limitAction } from "@/lib/rate-limit";
import { loadMailSamples } from "./samples";

export type TestMailState = { message?: string; error?: string };

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Manda a tu propio mail una prueba de un mail (o de todos) con datos de ejemplo. Sale directo por
 * Resend, sin pasar por la cola de la tienda, y con "[Prueba]" adelante del asunto.
 */
export async function sendTestMailAction(
  _state: TestMailState,
  formData: FormData,
): Promise<TestMailState> {
  const admin = await requireAdmin("/admin/mails");
  if (!mailEnabled())
    return { error: "La tienda no tiene cargada la clave de Resend: no sale ningún mail." };
  if (!admin.email) return { error: "Tu cuenta no tiene un mail cargado." };

  const wanted = String(formData.get("id") ?? "");
  const samples = await loadMailSamples();
  const chosen = wanted === "todos" ? samples : samples.filter((sample) => sample.id === wanted);
  if (chosen.length === 0) return { error: "No encontramos ese mail." };

  const limited = await limitAction("mail-prueba", 40, 60 * 60_000);
  if (limited) return { error: limited };

  const stamp = Date.now();
  let sent = 0;
  for (const sample of chosen) {
    try {
      await sendMail({
        to: admin.email,
        subject: `[Prueba] ${sample.subject}`,
        html: sample.html,
        text: sample.text,
        idempotencyKey: `prueba:${sample.id}:${stamp}`,
      });
      sent += 1;
    } catch {
      return {
        error:
          sent > 0
            ? `Salieron ${sent} y después Resend no dejó mandar más. Probá de nuevo en un rato.`
            : "Resend no dejó mandar la prueba. Probá de nuevo en un rato.",
      };
    }
    // Resend acepta pocos envíos por segundo: al mandar todos, se espera un poco entre uno y otro.
    if (chosen.length > 1) await pause(600);
  }
  return {
    message:
      sent === 1
        ? `Listo: te la mandamos a ${admin.email}. Tarda unos segundos en llegar.`
        : `Listo: te mandamos ${sent} mails a ${admin.email}. Tardan unos segundos en llegar.`,
  };
}
