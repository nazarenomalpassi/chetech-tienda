import { authTemplates, renderAuthTemplate, type AuthTemplate } from "@/lib/mail/auth-templates";

export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(authTemplates).map((tipo) => ({ tipo }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  if (!(tipo in authTemplates)) return new Response("No existe", { status: 404 });
  const html = await renderAuthTemplate(tipo as AuthTemplate);
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
