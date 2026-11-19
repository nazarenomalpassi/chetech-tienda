import { getProduct } from "@/lib/catalog";
import { productShareImage, shareImageSize, siteShareImage } from "@/lib/og";

export const alt = "Producto de CheTech con su precio";
export const size = shareImageSize;
export const contentType = "image/png";
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const product = await getProduct((await params).slug);
  return product ? productShareImage(product) : siteShareImage();
}
