import { NextResponse } from "next/server";
import { getProducts } from "@/lib/catalog";
import { isSellable, searchScore, sortProducts } from "@/lib/catalog-query";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  // Buscar mientras se escribe hace varios pedidos seguidos: el tope es holgado para una persona.
  const limited = rateLimit(request, "search", 90, 60_000);
  if (limited) return limited;
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (query.length < 2) return NextResponse.json({ results: [], total: 0 });

  const products = (await getProducts()).filter(isSellable);
  const scores = new Map<string, number>();
  const matches = products.filter((product) => {
    const score = searchScore(product, query);
    if (score) scores.set(product.id, score);
    return score > 0;
  });
  const ordered = sortProducts(matches, "popular", scores);

  return NextResponse.json(
    {
      total: ordered.length,
      results: ordered.slice(0, 6).map((product) => ({
        slug: product.slug,
        name: product.name,
        price: product.price,
        image: product.image ?? null,
        family: product.familyName,
        status: product.status,
      })),
    },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
  );
}
