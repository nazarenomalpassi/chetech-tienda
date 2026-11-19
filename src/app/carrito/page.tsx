import type { Metadata } from "next";
import { CheckoutClient } from "@/components/store/checkout/checkout-client";
import { getStoreSettings } from "@/lib/store-settings";

export const metadata: Metadata = {
  title: "Tu carrito",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const settings = await getStoreSettings();
  return <CheckoutClient payments={settings.payments} delivery={settings.delivery} />;
}
