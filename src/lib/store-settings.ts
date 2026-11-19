import "server-only";

import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

export const STORE_SETTINGS_TAG = "storefront-settings";

export type LocalZone = { id: string; name: string; price: number; detail?: string };

export type StoreSettings = {
  payments: {
    mercadopago: boolean;
    transfer: boolean;
    pickupPayment: boolean;
    pickupPaymentMax: number | null;
    mercadopagoReservationMinutes: number;
    offlineReservationHours: number;
  };
  delivery: {
    pickup: boolean;
    local: boolean;
    localZones: LocalZone[];
    correo: boolean;
    correoRates: Partial<Record<"chico" | "mediano" | "grande", number | null>>;
  };
  promo: {
    tvChannels: string[];
    reelProductSlug: string | null;
    reelTitle: string;
  };
};

export const defaultStoreSettings: StoreSettings = {
  payments: {
    mercadopago: false,
    transfer: false,
    pickupPayment: false,
    pickupPaymentMax: null,
    mercadopagoReservationMinutes: 30,
    offlineReservationHours: 24,
  },
  delivery: { pickup: true, local: false, localZones: [], correo: false, correoRates: {} },
  promo: { tvChannels: [], reelProductSlug: null, reelTitle: "" },
};

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(parsed) ? null : parsed;
}

async function fetchSettings(): Promise<StoreSettings> {
  const settings = structuredClone(defaultStoreSettings);
  const service = createServiceClient();
  if (service) {
    const { data, error } = await service.rpc("storefront_checkout_settings");
    if (!error && data && typeof data === "object") {
      const row = data as Record<string, unknown>;
      const delivery = (row.delivery ?? {}) as Record<string, unknown>;
      settings.payments = {
        mercadopago: Boolean(row.mercadopago) && Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN),
        transfer: Boolean(row.transfer),
        pickupPayment: Boolean(row.pickup_payment),
        pickupPaymentMax: toNumber(row.pickup_payment_max),
        mercadopagoReservationMinutes: toNumber(row.mercadopago_reservation_minutes) ?? 30,
        offlineReservationHours: toNumber(row.offline_reservation_hours) ?? 24,
      };
      settings.delivery = {
        pickup: delivery.pickup !== false,
        local: Boolean(delivery.local),
        localZones: Array.isArray(delivery.local_zones)
          ? (delivery.local_zones as Record<string, unknown>[]).flatMap((zone) => {
              const price = toNumber(zone.price);
              if (!zone.id || !zone.name || price === null) return [];
              return [{ id: String(zone.id), name: String(zone.name), price, detail: zone.detail ? String(zone.detail) : undefined }];
            })
          : [],
        correo: Boolean(delivery.correo),
        correoRates: Object.fromEntries(
          Object.entries((delivery.correo_rates ?? {}) as Record<string, unknown>).map(([size, value]) => [size, toNumber(value)]),
        ),
      };
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await anon.from("storefront_settings").select("value").eq("key", "promo").maybeSingle();
    const promo = (data?.value ?? {}) as Record<string, unknown>;
    settings.promo = {
      tvChannels: Array.isArray(promo.tv_channels) ? promo.tv_channels.map(String).slice(0, 5) : [],
      reelProductSlug: promo.reel_product_slug ? String(promo.reel_product_slug) : null,
      reelTitle: promo.reel_title ? String(promo.reel_title) : "",
    };
  }
  return settings;
}

const fetchSettingsCached = unstable_cache(fetchSettings, ["storefront-settings-v1"], {
  revalidate: 60,
  tags: [STORE_SETTINGS_TAG],
});

export async function getStoreSettings(): Promise<StoreSettings> {
  try {
    return await fetchSettingsCached();
  } catch {
    return defaultStoreSettings;
  }
}

export function anyOnlinePayment(settings: StoreSettings) {
  const { mercadopago, transfer, pickupPayment } = settings.payments;
  return mercadopago || transfer || pickupPayment;
}
