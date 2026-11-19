import { requireAccount } from "@/lib/auth";
import type { AddressRecord } from "@/components/account-forms";
import { EMPTY_REPAIR_SUMMARY, getMyCustomerRepairs, getMyCustomerRepairsSummary, isRepairFinalized } from "@/lib/repairs";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AccountOverview, type OverviewOrder } from "./account-overview";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const account = await requireAccount();
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const isCustomer = account.role === "customer";

  // Si compró sin cuenta con este mail (ya verificado), esos pedidos aparecen acá.
  await supabase.rpc("storefront_claim_guest_orders").then(
    () => undefined,
    () => undefined,
  );

  const [orders, addresses, repairSummary, repairPage] = await Promise.all([
    supabase
      .from("storefront_orders")
      .select("id,order_number,status,total,created_at,payment_method", { count: "exact" })
      .eq("user_id", account.id)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("customer_addresses")
      .select("*", { count: "exact" })
      .eq("user_id", account.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1),
    isCustomer ? getMyCustomerRepairsSummary().catch(() => EMPTY_REPAIR_SUMMARY) : Promise.resolve(EMPTY_REPAIR_SUMMARY),
    isCustomer ? getMyCustomerRepairs().catch(() => null) : Promise.resolve(null),
  ]);

  // Primero las reparaciones en curso; después las terminadas.
  const repairs = repairPage
    ? [...repairPage.items]
        .sort((a, b) => Number(isRepairFinalized(a.status)) - Number(isRepairFinalized(b.status)))
        .slice(0, 3)
    : null;

  return (
    <AccountOverview
      account={account}
      orders={(orders.data ?? []) as OverviewOrder[]}
      orderCount={orders.count ?? 0}
      repairs={isCustomer ? repairs : []}
      repairCount={repairSummary.total}
      defaultAddress={((addresses.data ?? [])[0] as AddressRecord | undefined) ?? null}
      addressCount={addresses.count ?? 0}
      notice={params.error === "sin-permisos" ? "Tu cuenta no tiene permisos para entrar a Administración." : null}
    />
  );
}
