import { shareImageSize, siteShareImage } from "@/lib/og";

export const alt = "CheTech: servicio técnico y tienda de tecnología en Río Tercero";
export const size = shareImageSize;
export const contentType = "image/png";

export default function Image() {
  return siteShareImage();
}
