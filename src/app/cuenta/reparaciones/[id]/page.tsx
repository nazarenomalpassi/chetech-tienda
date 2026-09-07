import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { RepairFocusRefresh } from "@/components/repair-focus-refresh";
import { siteConfig } from "@/config/site";
import { requireAccount } from "@/lib/auth";
import { formatDate, formatDateOnly } from "@/lib/date";
import { formatCurrency } from "@/lib/format";
import {
  formatRepairEquipment,
  getMyCustomerRepair,
  isRepairFinalized,
  isUuid,
  repairBudgetStatusLabel,
  repairStatusLabel,
  repairWhatsAppUrl,
} from "@/lib/repairs";

export const metadata: Metadata = {
  title: "Detalle de reparación",
  robots: { index: false, follow: false },
};

function formatPublicDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? formatDateOnly(value)
    : formatDate(value, { dateStyle: "medium" });
}

export default async function RepairDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const account = await requireAccount(`/cuenta/reparaciones/${id}`);
  if (account.role !== "customer") redirect("/cuenta");
  const repair = await getMyCustomerRepair(id);
  if (!repair) notFound();

  const finalized = isRepairFinalized(repair.status);
  const equipment = formatRepairEquipment(repair);

  return (
    <>
      <RepairFocusRefresh />
      <Link className="account-back-link" href="/cuenta/reparaciones">
        <ArrowLeft aria-hidden="true" />
        Mis reparaciones
      </Link>
      <div className="account-heading repair-detail-heading">
        <p className="eyebrow">{repair.repairNumber}</p>
        <h1>Detalle de reparación</h1>
        <p>{equipment}</p>
      </div>

      {repair.customerActionRequired && (
        <aside className="repair-action-banner" aria-label="Acción requerida">
          <CircleAlert aria-hidden="true" />
          <div>
            <strong>Necesitamos una respuesta tuya</strong>
            <p>
              Revisá el próximo paso informado por el taller o escribinos por WhatsApp para
              continuar.
            </p>
          </div>
        </aside>
      )}

      <section className="repair-detail-summary" aria-label="Resumen de la reparación">
        <div>
          <span>Estado actual</span>
          <strong className="status-pill repair-status" data-status={repair.status}>
            {repairStatusLabel(repair.status)}
          </strong>
        </div>
        <div>
          <span>Fecha de ingreso</span>
          <strong>{formatDateOnly(repair.intakeDate, { dateStyle: "long" })}</strong>
        </div>
        <div>
          <span>Seguimiento</span>
          <strong>{finalized ? "Reparación finalizada" : "Reparación activa"}</strong>
        </div>
        <div>
          <span>Última actualización</span>
          <strong>
            {formatDate(repair.lastUpdatedAt, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </strong>
        </div>
      </section>

      <div className="repair-detail-grid">
        <section className="repair-detail-panel" aria-labelledby="repair-device-title">
          <div className="repair-panel-heading">
            <Wrench aria-hidden="true" />
            <div>
              <p className="eyebrow">Equipo</p>
              <h2 id="repair-device-title">{repair.deviceType}</h2>
            </div>
          </div>
          <dl className="repair-detail-data">
            <div>
              <dt>Marca</dt>
              <dd>{repair.brand || "No informada"}</dd>
            </div>
            <div>
              <dt>Modelo</dt>
              <dd>{repair.model || "No informado"}</dd>
            </div>
            <div>
              <dt>Número de orden</dt>
              <dd>{repair.repairNumber}</dd>
            </div>
            {repair.warrantyUntil && (
              <div>
                <dt>Garantía</dt>
                <dd>Hasta el {formatDateOnly(repair.warrantyUntil, { dateStyle: "long" })}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="repair-detail-panel" aria-labelledby="repair-progress-title">
          <div className="repair-panel-heading">
            <Clock3 aria-hidden="true" />
            <div>
              <p className="eyebrow">Taller</p>
              <h2 id="repair-progress-title">Avance de reparación</h2>
            </div>
          </div>
          {repair.publicProgress ? (
            <p className="repair-progress-copy">{repair.publicProgress}</p>
          ) : (
            <p className="repair-muted-copy">
              Todavía no hay un avance público nuevo. El estado actual se mantiene actualizado
              arriba.
            </p>
          )}
          {repair.publicNextStep && (
            <div className="repair-next-step">
              <CheckCircle2 aria-hidden="true" />
              <div>
                <strong>Próximo paso</strong>
                <p>{repair.publicNextStep}</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {repair.budget && (
        <section className="repair-budget-panel" aria-labelledby="repair-budget-title">
          <div>
            <p className="eyebrow">Presupuesto</p>
            <h2 id="repair-budget-title">{formatCurrency(repair.budget.amount)}</h2>
            <span className="status-pill">{repairBudgetStatusLabel(repair.budget.status)}</span>
          </div>
          <dl>
            <div>
              <dt>Fecha</dt>
              <dd>
                {formatDate(repair.budget.budgetedAt, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </dd>
            </div>
            {repair.budget.validUntil && (
              <div>
                <dt>Vigencia</dt>
                <dd>Hasta el {formatPublicDate(repair.budget.validUntil)}</dd>
              </div>
            )}
            {repair.budget.description && (
              <div className="repair-budget-description">
                <dt>Detalle del presupuesto</dt>
                <dd>{repair.budget.description}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <section className="repair-timeline-section" aria-labelledby="repair-timeline-title">
        <div className="repair-section-heading">
          <div>
            <p className="eyebrow">Historial público</p>
            <h2 id="repair-timeline-title">Actualizaciones</h2>
          </div>
          <CalendarDays aria-hidden="true" />
        </div>
        {repair.updates.length ? (
          <ol className="repair-timeline">
            {repair.updates.map((update, index) => (
              <li key={`${update.createdAt}-${index}`}>
                <div className="repair-timeline-marker" aria-hidden="true" />
                <article>
                  <div className="repair-timeline-meta">
                    <time dateTime={update.createdAt}>
                      {formatDate(update.createdAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                    {update.status && (
                      <span className="status-pill repair-status" data-status={update.status}>
                        {repairStatusLabel(update.status)}
                      </span>
                    )}
                  </div>
                  <h3>{update.title}</h3>
                  {update.message && <p>{update.message}</p>}
                  {update.customerActionRequired && (
                    <strong className="repair-timeline-action">
                      <CircleAlert aria-hidden="true" />
                      Requiere tu respuesta
                    </strong>
                  )}
                </article>
              </li>
            ))}
          </ol>
        ) : (
          <p className="repair-timeline-empty">
            Las próximas actualizaciones públicas del taller aparecerán en esta sección.
          </p>
        )}
      </section>

      <section className="repair-contact-panel" aria-labelledby="repair-contact-title">
        <div>
          <p className="eyebrow">Estamos para ayudarte</p>
          <h2 id="repair-contact-title">¿Querés consultarnos algo?</h2>
          <p>Tené a mano el número {repair.repairNumber} para que podamos ayudarte más rápido.</p>
        </div>
        <div className="repair-contact-details">
          <a href={`tel:+${siteConfig.whatsapp}`}>
            <Phone aria-hidden="true" />
            {siteConfig.phoneDisplay}
          </a>
          <a href={`mailto:${siteConfig.email}`}>
            <Mail aria-hidden="true" />
            {siteConfig.email}
          </a>
          <span>
            <MapPin aria-hidden="true" />
            {siteConfig.address}, {siteConfig.location}
          </span>
        </div>
        <a
          className="button whatsapp"
          href={repairWhatsAppUrl(repair)}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle aria-hidden="true" />
          Consultar por WhatsApp
        </a>
      </section>

      {repair.warrantyUntil && (
        <p className="repair-warranty-note">
          <ShieldCheck aria-hidden="true" />
          Esta reparación informa garantía hasta el{" "}
          {formatDateOnly(repair.warrantyUntil, { dateStyle: "long" })}.
        </p>
      )}
    </>
  );
}
