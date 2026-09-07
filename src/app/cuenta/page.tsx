import Link from "next/link";
import { House, MailCheck, PackageSearch, UserRound, Wrench } from "lucide-react";
import { requireAccount } from "@/lib/auth";
import { EMPTY_REPAIR_SUMMARY, getMyCustomerRepairsSummary } from "@/lib/repairs";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const account = await requireAccount();
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const [{ count: orderCount }, { count: addressCount }, repairSummary] = await Promise.all([
    supabase
      .from("storefront_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", account.id),
    supabase
      .from("customer_addresses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", account.id),
    account.role === "customer"
      ? getMyCustomerRepairsSummary().catch(() => EMPTY_REPAIR_SUMMARY)
      : Promise.resolve(EMPTY_REPAIR_SUMMARY),
  ]);
  return (
    <>
      <div className="account-heading">
        <p className="eyebrow">Resumen</p>
        <h1>Hola, {account.firstName || "bienvenido"}.</h1>
        <p>Desde acá podés mantener tus datos listos y seguir cada solicitud.</p>
      </div>
      {params.error === "sin-permisos" && (
        <p className="form-message error">
          Tu cuenta no tiene permisos para acceder a administración.
        </p>
      )}
      <div className="account-card-grid">
        <Link href="/cuenta/perfil">
          <UserRound />
          <strong>Datos personales</strong>
          <span>Completá teléfono y nombre.</span>
        </Link>
        <Link href="/cuenta/direcciones">
          <House />
          <strong>{addressCount ?? 0} direcciones</strong>
          <span>Guardá envío o elegí retiro.</span>
        </Link>
        <Link href="/cuenta/pedidos">
          <PackageSearch />
          <strong>{orderCount ?? 0} pedidos</strong>
          <span>Consultá estados y detalles.</span>
        </Link>
        {account.role === "customer" && (
          <Link href="/cuenta/reparaciones">
            <Wrench />
            <strong>
              {repairSummary.total} {repairSummary.total === 1 ? "reparación" : "reparaciones"}
            </strong>
            <span>
              {repairSummary.recentUpdates > 0
                ? `${repairSummary.recentUpdates} ${
                    repairSummary.recentUpdates === 1 ? "novedad reciente" : "novedades recientes"
                  }`
                : repairSummary.active > 0
                  ? `${repairSummary.active} en seguimiento`
                  : "Seguimiento de tus equipos."}
            </span>
          </Link>
        )}
        <Link href="/cuenta/seguridad">
          <MailCheck />
          <strong>{account.emailVerified ? "Correo verificado" : "Verificación pendiente"}</strong>
          <span>Administrá tu acceso.</span>
        </Link>
      </div>
    </>
  );
}
