"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { safeReturnPath } from "@/lib/auth";
import { legalConfig } from "@/config/legal";
import { siteConfig } from "@/config/site";
import { passwordError } from "@/lib/password";

export type AuthActionState = { message?: string; error?: string };

function value(formData: FormData, name: string, max = 300) {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

async function requestOrigin() {
  const headerStore = await headers();
  const configuredOrigin = new URL(siteConfig.baseUrl).origin;
  const origin = headerStore.get("origin");
  if (!origin) return configuredOrigin;

  try {
    const requestedOrigin = new URL(origin);
    if (requestedOrigin.origin === configuredOrigin) return configuredOrigin;
    if (
      process.env.NODE_ENV !== "production" &&
      ["localhost", "127.0.0.1"].includes(requestedOrigin.hostname)
    )
      return requestedOrigin.origin;
  } catch {
    // Fall back to the configured site; never reflect a malformed Origin.
  }

  return configuredOrigin;
}

export async function loginAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = value(formData, "email", 254).toLowerCase();
  const password = value(formData, "password", 200);
  const next = safeReturnPath(formData.get("next"), "/cuenta");
  if (!validEmail(email) || !password) return { error: "Revisá el correo y la contraseña." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed")
      return { error: "Primero verificá tu correo. Podés reenviar el enlace desde esta pantalla." };
    return { error: "No pudimos iniciar sesión. Revisá los datos o recuperá tu contraseña." };
  }
  redirect(next);
}

export async function signupAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const firstName = value(formData, "firstName", 80);
  const lastName = value(formData, "lastName", 80);
  const email = value(formData, "email", 254).toLowerCase();
  const password = value(formData, "password", 200);
  const next = safeReturnPath(formData.get("next"), "/cuenta");
  const termsAccepted = formData.get("termsAccepted") === "on";
  const marketingConsent = formData.get("marketingConsent") === "on";
  if (!firstName || !lastName) return { error: "Ingresá tu nombre y apellido." };
  if (!validEmail(email)) return { error: "Ingresá un correo válido." };
  const invalidPassword = passwordError(password);
  if (invalidPassword) return { error: invalidPassword };
  if (!termsAccepted)
    return { error: "Necesitamos que aceptes los términos y la política de privacidad." };

  const supabase = await createServerSupabaseClient();
  const origin = await requestOrigin();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      data: {
        first_name: firstName,
        last_name: lastName,
        terms_version: legalConfig.version,
        privacy_version: legalConfig.version,
        marketing_consent: marketingConsent,
      },
    },
  });
  if (error)
    return { error: "No pudimos completar el registro. Esperá un momento e intentá nuevamente." };
  redirect(`/verificar-correo?email=${encodeURIComponent(email)}`);
}

export async function recoverPasswordAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = value(formData, "email", 254).toLowerCase();
  if (!validEmail(email)) return { error: "Ingresá un correo válido." };
  const supabase = await createServerSupabaseClient();
  const origin = await requestOrigin();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/actualizar-contrasena")}`,
  });
  return {
    message:
      "Si el correo corresponde a una cuenta, vas a recibir un enlace para crear una nueva contraseña.",
  };
}

export async function resendVerificationAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = value(formData, "email", 254).toLowerCase();
  if (!validEmail(email)) return { error: "Ingresá un correo válido." };
  const supabase = await createServerSupabaseClient();
  const origin = await requestOrigin();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/cuenta` },
  });
  if (error) {
    console.error("Auth verification resend failed", {
      code: error.code,
      status: error.status,
    });
    return {
      error:
        "No pudimos solicitar otro enlace en este momento. Esperá unos minutos e intentá nuevamente.",
    };
  }
  return {
    message:
      "Si la cuenta está pendiente, vas a recibir un nuevo enlace. Si ya estaba registrada, ingresá o recuperá tu contraseña.",
  };
}

export async function updatePasswordAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = value(formData, "password", 200);
  const confirmation = value(formData, "passwordConfirmation", 200);
  const invalidPassword = passwordError(password);
  if (invalidPassword) return { error: invalidPassword };
  if (password !== confirmation) return { error: "Las contraseñas no coinciden." };
  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub)
    return { error: "El enlace venció o la sesión no es válida. Solicitá uno nuevo." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "No pudimos actualizar la contraseña. Solicitá un enlace nuevo." };
  return { message: "Tu contraseña se actualizó correctamente." };
}

export async function logoutAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
}
