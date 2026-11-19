import "server-only";

import { hashToken } from "@/lib/commerce/tokens";
import type { OrderPayload } from "@/lib/commerce/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/** Trae un pedido para quien lo hizo: con la clave del enlace o con su sesión. */
export async function getCustomerOrder(orderNumber: string, token: string | null): Promise<OrderPayload | null> {
  const service = createServiceClient();
  if (!service) return null;
  let userId: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!token && !userId) return null;
  const { data } = await service.rpc("storefront_order_for_customer", {
    p_order_number: orderNumber.slice(0, 20),
    p_token_hash: token ? hashToken(token.slice(0, 100)) : null,
    p_user_id: userId,
  });
  return (data as OrderPayload | null) ?? null;
}
