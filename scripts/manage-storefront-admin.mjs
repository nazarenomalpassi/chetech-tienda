import { createClient } from "@supabase/supabase-js";

const [action, emailArgument] = process.argv.slice(2);
const email = String(emailArgument ?? "")
  .trim()
  .toLowerCase();
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const allowedActions = new Set(["invite", "promote", "demote", "disable", "enable"]);

if (!allowedActions.has(action) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(
    "Uso: node scripts/manage-storefront-admin.mjs <invite|promote|demote|disable|enable> <correo>",
  );
  process.exit(1);
}
if (!url || !secret) {
  console.error(
    "Faltan SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SECRET_KEY en el entorno local.",
  );
  process.exit(1);
}
if (
  secret === process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  secret === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
) {
  console.error("SUPABASE_SECRET_KEY debe ser una clave privada y nunca una clave NEXT_PUBLIC.");
  process.exit(1);
}

const supabase = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail() {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

async function writeAudit(userId, operation) {
  const { error } = await supabase.from("storefront_admin_logs").insert({
    admin_user_id: null,
    action: operation,
    entity_type: "auth_user",
    entity_id: userId,
    metadata: { source: "local_admin_script" },
  });
  if (error) throw error;
}

let user = await findUserByEmail();
if (action === "invite") {
  if (user) throw new Error("La cuenta ya existe. Usá promote si corresponde.");
  const invited = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent("/actualizar-contrasena")}`,
  });
  if (invited.error || !invited.data.user)
    throw invited.error ?? new Error("No se pudo crear la invitación.");
  user = invited.data.user;
}
if (!user) throw new Error("No existe una cuenta con ese correo.");

if (action === "invite" || action === "promote") {
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, role: "admin" },
  });
  if (error) throw error;
  const profile = await supabase
    .from("profiles")
    .update({ role: "admin", account_status: "active", deactivated_at: null })
    .eq("id", user.id);
  if (profile.error) throw profile.error;
  await writeAudit(user.id, action === "invite" ? "admin.invited" : "admin.promoted");
  console.log(
    action === "invite" ? "Invitación de administrador enviada." : "Rol de administrador asignado.",
  );
} else if (action === "demote") {
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, role: "customer" },
  });
  if (error) throw error;
  const profile = await supabase.from("profiles").update({ role: "customer" }).eq("id", user.id);
  if (profile.error) throw profile.error;
  await writeAudit(user.id, "admin.demoted");
  console.log("Acceso administrativo revocado. Las políticas RLS lo aplican de inmediato.");
} else {
  const disabling = action === "disable";
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    ban_duration: disabling ? "876000h" : "none",
  });
  if (error) throw error;
  const profile = await supabase
    .from("profiles")
    .update({
      account_status: disabling ? "disabled" : "active",
      deactivated_at: disabling ? new Date().toISOString() : null,
    })
    .eq("id", user.id);
  if (profile.error) throw profile.error;
  await writeAudit(user.id, disabling ? "account.disabled" : "account.enabled");
  console.log(disabling ? "Cuenta desactivada." : "Cuenta reactivada.");
}
