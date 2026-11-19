import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, CircleAlert, Clock3, ShieldCheck, Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { AccountHeading } from "../account-heading";
import { RepairFocusRefresh } from "@/components/repair-focus-refresh";
import { requireAccount } from "@/lib/auth";
import { formatDate, formatDateOnly } from "@/lib/date";
import { formatCurrency } from "@/lib/format";
import {
  decodeRepairCursor,
  encodeRepairCursor,
  formatRepairEquipment,
  getMyCustomerRepairs,
  isRepairFinalized,
  repairBudgetStatusLabel,
  repairStatusLabel,
} from "@/lib/repairs";

export const metadata: Metadata = {
  title: "Mis reparaciones",
  robots: { index: false, follow: false },
};

type RepairsSearchParams = {
  cursor?: string | string[];
};

export default async function RepairsPage({
  searchParams,
}: {
  searchParams: Promise<RepairsSearchParams>;
}) {
  const account = await requireAccount("/cuenta/reparaciones");
  if (account.role !== "customer") redirect("/cuenta");
  const params = await searchParams;
  const cursor = decodeRepairCursor(params.cursor);
  if (params.cursor && !cursor) redirect("/cuenta/reparaciones");

  const page = await getMyCustomerRepairs(cursor);
  const nextCursor = page.nextCursor ? encodeRepairCursor(page.nextCursor) : "";

  return (
    <>
      <RepairFocusRefresh />
      <AccountHeading title="Reparaciones">
        El estado, las novedades del taller y el próximo paso de cada equipo que dejaste.
      </AccountHeading>

      {!page.items.length && !cursor && (
        <div className="empty-state repair-empty-state">
          <Wrench aria-hidden="true" />
          <h2>Todavía no tenés reparaciones asociadas a tu cuenta.</h2>
          <p>
            Cuando ingreses un equipo a nuestro servicio técnico, vas a poder seguirlo desde acá.
          </p>
          <Link className="btn" href="/servicio-tecnico">
            Ver el servicio técnico
          </Link>
        </div>
      )}

      {!page.items.length && cursor && (
        <div className="empty-state repair-empty-state">
          <Clock3 aria-hidden="true" />
          <h2>No hay reparaciones más antiguas.</h2>
          <p>Volvé al inicio del listado para consultar las novedades más recientes.</p>
          <Link className="btn" href="/cuenta/reparaciones">
            Ver las más recientes
          </Link>
        </div>
      )}

      {!!page.items.length && (
        <section aria-labelledby="repair-list-title">
          <h2 className="sr-only" id="repair-list-title">
            Reparaciones asociadas
          </h2>
          <div className="repair-list">
            {page.items.map((repair) => {
              const finalized = isRepairFinalized(repair.status);
              return (
                <article
                  className={`repair-card ${finalized ? "is-finalized" : "is-active"}`}
                  key={repair.publicId}
                >
                  <Link
                    aria-label={`Ver reparación ${repair.repairNumber}: ${formatRepairEquipment(repair)}`}
                    href={`/cuenta/reparaciones/${repair.publicId}`}
                  >
                    <div className="repair-card-topline">
                      <span>{repair.repairNumber}</span>
                      <span className="repair-lifecycle">
                        {finalized ? "Finalizada" : "En seguimiento"}
                      </span>
                    </div>
                    <div className="repair-card-heading">
                      <div>
                        <span className="repair-card-date">
                          <CalendarDays aria-hidden="true" />
                          Ingresó el {formatDateOnly(repair.intakeDate)}
                        </span>
                        <h2>{formatRepairEquipment(repair)}</h2>
                      </div>
                      <span className="status-pill repair-status" data-status={repair.status}>
                        {repairStatusLabel(repair.status)}
                      </span>
                    </div>

                    {repair.customerActionRequired && (
                      <p className="repair-action-callout">
                        <CircleAlert aria-hidden="true" />
                        Necesitamos una respuesta tuya
                      </p>
                    )}

                    {repair.publicProgress && (
                      <p className="repair-card-progress">{repair.publicProgress}</p>
                    )}

                    <dl className="repair-card-facts">
                      {repair.budget && (
                        <div>
                          <dt>Presupuesto</dt>
                          <dd>
                            {formatCurrency(repair.budget.amount)} ·{" "}
                            {repairBudgetStatusLabel(repair.budget.status)}
                          </dd>
                        </div>
                      )}
                      {repair.warrantyUntil && (
                        <div>
                          <dt>
                            <ShieldCheck aria-hidden="true" />
                            Garantía
                          </dt>
                          <dd>Hasta el {formatDateOnly(repair.warrantyUntil)}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Última actualización</dt>
                        <dd>
                          {formatDate(repair.lastUpdatedAt, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </dd>
                      </div>
                    </dl>
                    <span className="repair-card-link">
                      Ver detalle <ArrowRight aria-hidden="true" />
                    </span>
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {(cursor || nextCursor) && (
        <nav className="repair-pagination" aria-label="Páginas de reparaciones">
          {cursor ? (
            <Link href="/cuenta/reparaciones" rel="prev">
              Más recientes
            </Link>
          ) : (
            <span />
          )}
          {nextCursor && (
            <Link href={`/cuenta/reparaciones?cursor=${encodeURIComponent(nextCursor)}`} rel="next">
              Ver anteriores <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
