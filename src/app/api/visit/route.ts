import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const BOT = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|slurp|headless|lighthouse/i;

export async function POST(request: Request) {
  if (BOT.test(request.headers.get("user-agent") ?? "")) return new NextResponse(null, { status: 204 });
  const service = createServiceClient();
  if (!service) return new NextResponse(null, { status: 204 });
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const text = (value: unknown, max: number) => String(value ?? "").slice(0, max);
  await service.rpc("storefront_track_visit", {
    p_source: text(body.source, 60),
    p_medium: text(body.medium, 60),
    p_campaign: text(body.campaign, 80),
    p_content: text(body.content, 80),
    p_landing: text(body.landing, 120),
  });
  return new NextResponse(null, { status: 204 });
}
