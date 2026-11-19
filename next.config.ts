import type { NextConfig } from "next";

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";
// Medición: solo se habilitan los dominios de Google y Meta si sus identificadores están cargados.
const analytics = {
  script: [
    process.env.NEXT_PUBLIC_GA_ID ? "https://www.googletagmanager.com" : "",
    process.env.NEXT_PUBLIC_META_PIXEL_ID ? "https://connect.facebook.net" : "",
  ],
  connect: [
    process.env.NEXT_PUBLIC_GA_ID
      ? "https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com"
      : "",
    process.env.NEXT_PUBLIC_META_PIXEL_ID ? "https://www.facebook.com https://connect.facebook.net" : "",
  ],
  img: [
    process.env.NEXT_PUBLIC_GA_ID ? "https://www.googletagmanager.com https://*.google-analytics.com" : "",
    process.env.NEXT_PUBLIC_META_PIXEL_ID ? "https://www.facebook.com" : "",
  ],
};
const extra = (list: string[]) => list.filter(Boolean).map((item) => ` ${item}`).join("");

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${extra(analytics.script)}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ""}${extra(analytics.img)}`,
  "font-src 'self' data:",
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin} ${supabaseOrigin.replace("https://", "wss://")}` : ""}${extra(analytics.connect)}`,
  "media-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: supabaseHostname
    ? {
        remotePatterns: [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/**",
          },
        ],
      }
    : undefined,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
