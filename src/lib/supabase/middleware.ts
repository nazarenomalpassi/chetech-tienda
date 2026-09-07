import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

function credentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

export async function refreshSupabaseSession(
  request: NextRequest,
  requestHeaders = request.headers,
  loadProfile = true,
) {
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const configured = credentials();
  if (!configured) return { response, userId: null, role: null, accountStatus: null };

  const supabase = createServerClient(configured.url, configured.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (!userId) return { response, userId: null, role: null, accountStatus: null };
  if (!loadProfile) return { response, userId, role: null, accountStatus: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,account_status")
    .eq("id", userId)
    .maybeSingle();
  return {
    response,
    userId,
    role: typeof profile?.role === "string" ? profile.role : null,
    accountStatus: typeof profile?.account_status === "string" ? profile.account_status : null,
  };
}
