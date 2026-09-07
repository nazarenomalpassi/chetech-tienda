import Link from "next/link";
import { formatDate } from "@/lib/date";
import { formatPrice } from "@/lib/format";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q = "" } = await searchParams;
  const supabase = await createServerSupabaseClient();
  let profilesQuery = supabase
    .from("profiles")
    .select("id,first_name,last_name,full_name,email,phone,account_status,created_at,last_login_at")
    .eq("role", "customer")
    .order("created_at", { ascending: false })
    .limit(200);
  if (q.trim())
    profilesQuery = profilesQuery.or(
      `full_name.ilike.%${q.trim().slice(0, 80)}%,email.ilike.%${q.trim().slice(0, 80)}%,phone.ilike.%${q.trim().slice(0, 80)}%`,
    );
  const [{ data: profiles }, { data: orders }] = await Promise.all([
    profilesQuery,
    supabase.from("storefront_orders").select("user_id,status,total,created_at"),
  ]);
  const stats = new Map<string, { count: number; total: number; last?: string }>();
  for (const order of orders ?? []) {
    const current = stats.get(order.user_id) ?? { count: 0, total: 0 };
    current.count += 1;
    if (
      [
        "confirmed",
        "awaiting_payment",
        "paid",
        "preparing",
        "shipped",
        "ready_for_pickup",
        "completed",
      ].includes(order.status)
    )
      current.total += Number(order.total);
    if (!current.last || order.created_at > current.last) current.last = order.created_at;
    stats.set(order.user_id, current);
  }
  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">Cuentas</p>
        <h1>Clientes</h1>
        <p>Datos mínimos de cuenta y actividad de pedidos. Las contraseñas nunca son visibles.</p>
      </div>
      <form className="admin-search">
        <label htmlFor="customer-search">Buscar por nombre, correo o teléfono</label>
        <div>
          <input id="customer-search" name="q" defaultValue={q} />
          <button className="button primary">Buscar</button>
        </div>
      </form>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Registro</th>
              <th>Último pedido</th>
              <th>Pedidos</th>
              <th>Total confirmado</th>
              <th>Cuenta</th>
            </tr>
          </thead>
          <tbody>
            {profiles?.map((profile) => {
              const customerStats = stats.get(profile.id);
              return (
                <tr key={profile.id}>
                  <td>
                    <strong>
                      {profile.full_name ||
                        `${profile.first_name ?? ""} ${profile.last_name ?? ""}`}
                    </strong>
                    <span>{profile.email}</span>
                    <span>{profile.phone || "Sin teléfono"}</span>
                  </td>
                  <td>{formatDate(profile.created_at, { dateStyle: "short" })}</td>
                  <td>
                    {customerStats?.last
                      ? formatDate(customerStats.last, { dateStyle: "short" })
                      : "—"}
                  </td>
                  <td>{customerStats?.count ?? 0}</td>
                  <td>{formatPrice(customerStats?.total ?? 0)}</td>
                  <td>
                    <span
                      className={`status-pill ${profile.account_status === "active" ? "active" : ""}`}
                    >
                      {profile.account_status === "active" ? "Activa" : "Restringida"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!profiles?.length && (
          <div className="empty-state">
            <h2>No hay clientes para mostrar.</h2>
          </div>
        )}
      </div>
      <p className="admin-source-note">
        La desactivación, revocación de sesiones y atención de solicitudes de privacidad se realizan
        mediante el procedimiento seguro documentado; no se ofrecen acciones destructivas rápidas
        desde esta lista.
      </p>
      <Link className="text-link" href="/solicitudes-de-privacidad">
        Ver canal público de privacidad
      </Link>
    </>
  );
}
