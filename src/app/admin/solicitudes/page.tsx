import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import styles from "../inbox.module.css";
import {
  RequestsBoard,
  requestViews,
  type ConsumerRequest,
  type RequestView,
} from "./requests-board";

export const metadata = { title: "Solicitudes" };

async function requestTime() {
  // La página se arma en cada pedido: la hora sirve para decir hace cuánto espera cada solicitud.
  await connection();
  return Date.now();
}

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  await requireAdmin("/admin/solicitudes");
  const wanted = (await searchParams).vista;
  const view: RequestView = requestViews.some((item) => item.key === wanted)
    ? (wanted as RequestView)
    : "abiertas";
  const supabase = await createServerSupabaseClient();
  const [{ data, error }, now] = await Promise.all([
    supabase.rpc("get_consumer_requests_admin", { p_limit: 300 }),
    requestTime(),
  ]);
  const all = (Array.isArray(data) ? data : []) as ConsumerRequest[];
  const statuses = requestViews.find((item) => item.key === view)?.statuses ?? [];
  const counts = Object.fromEntries(
    requestViews.map((item) => [
      item.key,
      all.filter((request) => item.statuses.includes(request.status)).length,
    ]),
  ) as Record<RequestView, number>;
  // Las abiertas, de la más vieja a la más nueva: la que más espera va primero.
  const requests = all.filter((request) => statuses.includes(request.status));
  if (view === "abiertas") requests.reverse();

  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">Clientes</p>
        <h1>Solicitudes</h1>
        <p>
          Lo que entra por el botón de arrepentimiento y por el formulario de datos personales. El
          cliente ya recibió su código de constancia; acá ves qué pidió, le respondés y dejás
          registrado en qué quedó.
        </p>
      </div>

      {error ? (
        <p className={styles.message} data-kind="error" role="alert">
          No pudimos cargar las solicitudes. Recargá la página.
        </p>
      ) : null}

      <RequestsBoard requests={requests} view={view} counts={counts} now={now} />
    </>
  );
}
