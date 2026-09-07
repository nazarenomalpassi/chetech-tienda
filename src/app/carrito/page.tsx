import { CartPageClient } from "@/components/cart-page-client";
import { getCurrentAccount } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function CartPage() {
  const account = await getCurrentAccount();
  let addresses: Array<{
    id: string;
    label: string;
    recipient_name: string;
    street: string;
    street_number: string;
    city: string;
    province: string;
    postal_code: string;
    is_default: boolean;
  }> = [];
  if (account?.accountStatus === "active") {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("customer_addresses")
      .select("id,label,recipient_name,street,street_number,city,province,postal_code,is_default")
      .eq("user_id", account.id)
      .order("is_default", { ascending: false });
    addresses = data ?? [];
  }
  return (
    <CartPageClient
      account={
        account
          ? {
              fullName: account.fullName,
              phone: account.phone,
              emailVerified: account.emailVerified,
              active: account.accountStatus === "active",
            }
          : null
      }
      addresses={addresses}
    />
  );
}
