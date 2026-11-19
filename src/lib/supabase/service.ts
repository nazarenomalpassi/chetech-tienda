import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/**
 * Cliente con la clave de servicio. Solo existe en el servidor y se usa para lo que no tiene
 * sesión: pedidos sin cuenta, avisos de pago, cola de mails y medición. Cada función de la base
 * que llama valida por su cuenta lo que recibe.
 */
export function createServiceClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client =
    url && key
      ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
  return client;
}
