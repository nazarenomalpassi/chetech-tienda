import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AccountProfile = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  role: string;
  accountStatus: string;
  emailVerified: boolean;
  marketingConsent: boolean;
};

export const getCurrentAccount = cache(async (): Promise<AccountProfile | null> => {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const id = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  if (!id) return null;

  const { data } = await supabase
    .from("profiles")
    .select(
      "id,email,first_name,last_name,full_name,phone,role,account_status,email_verified,marketing_consent",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id),
    email: String(data.email ?? claimsData?.claims?.email ?? ""),
    firstName: String(data.first_name ?? ""),
    lastName: String(data.last_name ?? ""),
    fullName: String(data.full_name ?? ""),
    phone: String(data.phone ?? ""),
    role: String(data.role ?? "customer"),
    accountStatus: String(data.account_status ?? "disabled"),
    emailVerified: Boolean(data.email_verified),
    marketingConsent: Boolean(data.marketing_consent),
  };
});

export async function requireAccount(next = "/cuenta") {
  const account = await getCurrentAccount();
  if (!account) redirect(`/ingresar?next=${encodeURIComponent(next)}`);
  if (account.accountStatus !== "active") redirect("/cuenta-bloqueada");
  return account;
}

export async function requireAdmin(next = "/admin") {
  const account = await requireAccount(next);
  if (account.role !== "admin") redirect("/cuenta?error=sin-permisos");
  return account;
}

export function safeReturnPath(
  value: FormDataEntryValue | string | null | undefined,
  fallback = "/cuenta",
) {
  const candidate = typeof value === "string" ? value : "";
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\"))
    return fallback;
  return candidate.slice(0, 300);
}
