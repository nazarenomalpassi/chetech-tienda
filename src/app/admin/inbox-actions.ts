"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type InboxActionState = { message?: string; error?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_STATUSES = ["received", "in_review", "responded", "resolved", "rejected_with_reason"];

function id(formData: FormData) {
  const raw = formData.get("id");
  return typeof raw === "string" && UUID.test(raw) ? raw : null;
}

/** Lista de espera: marcar a alguien como avisado, o devolverlo a pendientes. */
export async function markWaitlistAction(formData: FormData) {
  await requireAdmin("/admin/lista-de-espera");
  const entry = id(formData);
  const service = createServiceClient();
  if (!entry || !service) return;
  await service
    .from("storefront_waitlist")
    .update({ notified_at: formData.get("notified") === "1" ? new Date().toISOString() : null })
    .eq("id", entry);
  revalidatePath("/admin", "layout");
}

/** Lista de espera: quitar a alguien (por ejemplo, si pidió que no le escriban más). */
export async function removeWaitlistAction(formData: FormData) {
  await requireAdmin("/admin/lista-de-espera");
  const entry = id(formData);
  const service = createServiceClient();
  if (!entry || !service) return;
  await service.from("storefront_waitlist").delete().eq("id", entry);
  revalidatePath("/admin", "layout");
}

/** Solicitudes de arrepentimiento y de datos personales: cambiar el estado. Queda en el historial. */
export async function updateRequestAction(
  _state: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  await requireAdmin("/admin/solicitudes");
  const request = id(formData);
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, 1000);
  if (!request || !REQUEST_STATUSES.includes(status)) return { error: "Elegí un estado." };
  if (status === "rejected_with_reason" && !note)
    return { error: "Para rechazarla, escribí el motivo." };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("update_consumer_request_status_admin", {
    p_request_id: request,
    p_status: status,
    p_note: note || null,
  });
  if (error || data === false) return { error: "No pudimos guardar el cambio. Probá de nuevo." };
  revalidatePath("/admin", "layout");
  return { message: "Guardado." };
}
