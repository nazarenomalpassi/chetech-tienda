import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CheckoutSettingsForm, DeliverySettingsForm, PromoSettingsForm } from "./settings-forms";
import styles from "./settings.module.css";

function integrations() {
  const env = process.env;
  const mercadopago = Boolean(env.MERCADOPAGO_ACCESS_TOKEN && env.MERCADOPAGO_WEBHOOK_SECRET);
  return [
    {
      name: "Mercado Pago",
      ok: mercadopago,
      text: mercadopago
        ? env.PAYMENTS_LIVE_ENABLED === "true"
          ? "Credenciales cargadas. Cobra de verdad."
          : "Credenciales cargadas. En modo de prueba: no cobra de verdad."
        : "Faltan MERCADOPAGO_ACCESS_TOKEN y MERCADOPAGO_WEBHOOK_SECRET en Railway.",
    },
    {
      name: "Mails",
      ok: Boolean(env.RESEND_API_KEY),
      text: env.RESEND_API_KEY
        ? `Salen desde ${env.MAIL_FROM ?? "CheTech <hola@chetechstore.com>"}.`
        : "Falta RESEND_API_KEY. Los mails quedan en cola y salen cuando se cargue.",
    },
    {
      name: "Aviso de pedidos nuevos",
      ok: true,
      text: `Llega a ${env.ADMIN_EMAIL ?? "chetech.reparaciones@gmail.com"}.`,
    },
    {
      name: "Google Analytics",
      ok: Boolean(env.NEXT_PUBLIC_GA_ID),
      text: env.NEXT_PUBLIC_GA_ID ? "Mide visitas de quien acepta las cookies." : "Falta NEXT_PUBLIC_GA_ID.",
    },
    {
      name: "Píxel de Meta",
      ok: Boolean(env.NEXT_PUBLIC_META_PIXEL_ID),
      text: env.NEXT_PUBLIC_META_PIXEL_ID ? "Mide visitas y compras de Instagram." : "Falta NEXT_PUBLIC_META_PIXEL_ID.",
    },
    {
      name: "Conversiones de Meta desde el servidor",
      ok: Boolean(env.META_CAPI_TOKEN && env.NEXT_PUBLIC_META_PIXEL_ID),
      text:
        env.META_CAPI_TOKEN && env.NEXT_PUBLIC_META_PIXEL_ID
          ? "Cada compra cobrada se informa a Meta."
          : "Falta META_CAPI_TOKEN (opcional, mejora la medición de Instagram).",
    },
  ];
}

export default async function AdminSettingsPage() {
  await requireAdmin("/admin/configuracion");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("storefront_admin_settings");
  const settings = (data ?? {}) as Record<string, unknown>;
  const mercadopagoReady = Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN && process.env.MERCADOPAGO_WEBHOOK_SECRET);

  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">Tienda</p>
        <h1>Configuración</h1>
        <p>Cobros, entregas y portada. Los cambios se ven en la tienda en menos de un minuto.</p>
      </div>

      <ul className={styles.status} aria-label="Conexiones">
        {integrations().map((item) => (
          <li key={item.name} data-ok={item.ok}>
            <strong>{item.name}</strong>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>

      {error ? (
        <p className={styles.message} data-kind="error" role="alert">
          No pudimos leer los ajustes. Recargá la página.
        </p>
      ) : (
        <>
          <CheckoutSettingsForm value={settings.checkout} mercadopagoReady={mercadopagoReady} />
          <DeliverySettingsForm value={settings.delivery} />
          <PromoSettingsForm value={settings.promo} />
        </>
      )}
    </>
  );
}
