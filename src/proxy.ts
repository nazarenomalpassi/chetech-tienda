import { NextRequest, NextResponse } from "next/server";
import { refreshSupabaseSession } from "@/lib/supabase/middleware";

function redirectPreservingSession(url: URL, sessionResponse: NextResponse) {
  const redirect = NextResponse.redirect(url);
  sessionResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const protectedCustomerRoute = pathname === "/cuenta" || pathname.startsWith("/cuenta/");
  const protectedAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const session = await refreshSupabaseSession(
    request,
    request.headers,
    protectedCustomerRoute || protectedAdminRoute,
  );
  let response = session.response;

  if ((protectedCustomerRoute || protectedAdminRoute) && !session.userId) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/ingresar";
    loginUrl.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    response = redirectPreservingSession(loginUrl, session.response);
  } else if (
    (protectedCustomerRoute || protectedAdminRoute) &&
    session.accountStatus !== "active"
  ) {
    const blockedUrl = request.nextUrl.clone();
    blockedUrl.pathname = "/cuenta-bloqueada";
    blockedUrl.search = "";
    response = redirectPreservingSession(blockedUrl, session.response);
  } else if (protectedAdminRoute && session.role !== "admin") {
    const accountUrl = request.nextUrl.clone();
    accountUrl.pathname = "/cuenta";
    accountUrl.search = "?error=sin-permisos";
    response = redirectPreservingSession(accountUrl, session.response);
  }
  const deploymentEnvironment = process.env.RAILWAY_ENVIRONMENT_NAME;
  if (deploymentEnvironment && deploymentEnvironment !== "production")
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (pathname.startsWith("/api/") || protectedCustomerRoute || protectedAdminRoute)
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/cuenta/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      source: "/admin/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      source: "/carrito",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    "/api/:path*",
  ],
};
