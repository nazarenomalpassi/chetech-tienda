import { productFeed } from "@/lib/feeds/product-feed";

export const revalidate = 3600;

export async function GET() {
  return new Response(await productFeed("meta"), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900, s-maxage=3600",
    },
  });
}
