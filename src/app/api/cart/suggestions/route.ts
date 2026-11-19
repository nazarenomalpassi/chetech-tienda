import { NextResponse } from "next/server";
import { getProducts } from "@/lib/catalog";
import { isSellable, sortProducts } from "@/lib/catalog-query";

// "Sumá también": productos chicos que más se venden en el local (pilas, cables, adaptadores).
export async function GET(request: Request) {
  const exclude = new Set(
    (new URL(request.url).searchParams.get("exclude") ?? "").split(",").filter(Boolean).slice(0, 30),
  );
  const pool = (await getProducts()).filter(
    (product) =>
      isSellable(product) &&
      product.status !== "Sin stock" &&
      product.price <= 10_000 &&
      !exclude.has(product.id),
  );
  const products = sortProducts(pool, "popular").slice(0, 4);
  return NextResponse.json(
    { products },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
