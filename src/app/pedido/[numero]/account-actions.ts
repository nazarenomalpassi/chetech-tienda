"use server";

import { legalConfig } from "@/config/legal";
import { siteConfig } from "@/config/site";
import { getCustomerOrder } from "@/lib/commerce/customer-order";
import { passwordError } from "@/lib/password";
import { limitAction } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type OrderAccountState = { message?: string; error?: string };

function value(formData: FormData, name: string, max: number) {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

/** Muestra el mail sin exponerlo entero: ana***@gmail.com */
function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "tu mail";
  return `${user.slice(0, 3)}***@${domain}`;
}

/**
 * Crea la cuenta desde el comprobante con los datos del pedido: el cliente solo elige la contraseña.
 * El pedido pasa a la cuenta cuando confirma el mail (storefront_claim_guest_orders).
 */
export async function createAccountFromOrderAction(
  _state: OrderAccountState,
  formData: FormData,
): Promise<OrderAccountState> {
  const orderNumber = value(formData, "orderNumber", 20);
  const token = value(formData, "token", 100);
  const password = typeof formData.get("password") === "string" ? String(formData.get("password")).slice(0, 200) : "";
  if (formData.get("termsAccepted") !== "on")
    return { error: "Necesitamos que aceptes los términos y la política de privacidad." };
  const invalidPassword = passwordError(password);
  if (invalidPassword) return { error: invalidPassword };
  const limited = await limitAction("signup", 5, 10 * 60_000);
  if (limited) return { error: limited };

  // La clave del enlace prueba que quien crea la cuenta es quien hizo el pedido.
  const order = token ? await getCustomerOrder(orderNumber, token) : null;
  if (!order) return { error: "No pudimos validar el pedido. Abrilo de nuevo desde el enlace del mail." };
  if (!order.is_guest) return { error: "Este pedido ya está guardado en una cuenta. Ingresá para verlo." };

  const [firstName, ...rest] = order.customer_name.trim().split(/\s+/);
  const origin = new URL(siteConfig.baseUrl).origin;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signUp({
    email: order.customer_email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/cuenta/pedidos")}`,
      data: {
        first_name: firstName ?? "",
        last_name: rest.join(" "),
        terms_version: legalConfig.version,
        privacy_version: legalConfig.version,
        marketing_consent: false,
      },
    },
  });
  if (error) {
    console.error("No se pudo crear la cuenta desde el pedido", { code: error.code, status: error.status });
    return { error: "No pudimos crear la cuenta en este momento. Probá de nuevo en unos minutos." };
  }
  return {
    message: `Te mandamos un mail a ${maskEmail(order.customer_email)} para confirmar la cuenta. Cuando lo confirmes, este pedido aparece en “Mis pedidos”. Si ese mail ya tenía cuenta, ingresá con tu contraseña.`,
  };
}
