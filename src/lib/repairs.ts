import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cleanWhatsAppText, whatsappUrl } from "@/lib/whatsapp";

export const REPAIR_PAGE_SIZE = 12;

export const repairStatusLabels = {
  pendiente_revision: "Pendiente de revisión",
  en_revision: "En revisión",
  presupuestado: "Presupuestado",
  presupuestado_aceptado: "Presupuestado y aceptado",
  presupuestado_rechazado: "Presupuestado y rechazado",
  listo_para_retirar: "Listo para retirar",
  retirado: "Retirado",
  sin_solucion: "Sin solución",
} as const;

export type RepairStatus = keyof typeof repairStatusLabels;

export const repairBudgetStatusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  enviado_al_cliente: "Enviado",
  aprobado: "Aceptado",
  aceptado: "Aceptado",
  rechazado: "Rechazado",
  vencido: "Vencido",
};

export type RepairBudget = {
  amount: number;
  budgetedAt: string;
  status: string;
  description: string;
  validUntil?: string;
};

export type CustomerRepair = {
  publicId: string;
  repairNumber: string;
  intakeDate: string;
  deviceType: string;
  brand: string;
  model: string;
  status: string;
  publicProgress: string;
  publicNextStep: string;
  customerActionRequired: boolean;
  lastUpdatedAt: string;
  warrantyUntil?: string;
  budget?: RepairBudget;
};

export type CustomerRepairUpdate = {
  eventType: string;
  status: string;
  title: string;
  message: string;
  customerActionRequired: boolean;
  createdAt: string;
};

export type CustomerRepairDetail = CustomerRepair & {
  updates: CustomerRepairUpdate[];
};

export type RepairCursor = {
  intakeDate: string;
  publicId: string;
};

export type CustomerRepairPage = {
  items: CustomerRepair[];
  nextCursor: RepairCursor | null;
};

export type CustomerRepairSummary = {
  total: number;
  active: number;
  recentUpdates: number;
};

export const EMPTY_REPAIR_SUMMARY: CustomerRepairSummary = {
  total: 0,
  active: 0,
  recentUpdates: 0,
};

type JsonRecord = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FINAL_REPAIR_STATUSES = new Set<string>([
  "presupuestado_rechazado",
  "retirado",
  "sin_solucion",
]);

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function unwrapRpcJson(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (Array.isArray(value) && value.length === 1 && asRecord(value[0])) return value[0];
  return value;
}

function readText(value: unknown, maximum = 500) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function readBoolean(value: unknown) {
  return value === true || value === "true";
}

function readNonNegativeInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function readNonNegativeNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function readDateOnly(value: unknown) {
  const text = readText(value, 40);
  const candidate = DATE_ONLY_PATTERN.test(text) ? text : text.slice(0, 10);
  if (!DATE_ONLY_PATTERN.test(candidate)) return "";
  const timestamp = Date.parse(`${candidate}T12:00:00.000Z`);
  return Number.isNaN(timestamp) ? "" : candidate;
}

function readTimestamp(value: unknown) {
  const text = readText(value, 80);
  return text && !Number.isNaN(Date.parse(text)) ? text : "";
}

function parseBudget(value: unknown): RepairBudget | undefined {
  const row = asRecord(value);
  if (!row) return undefined;
  const amount = readNonNegativeNumber(row.amount);
  const budgetedAt = readTimestamp(row.budgeted_at);
  const status = readText(row.status, 80);
  if (amount === null || !budgetedAt || !status) return undefined;
  const validUntil = readTimestamp(row.valid_until) || readDateOnly(row.valid_until);
  return {
    amount,
    budgetedAt,
    status,
    description: readText(row.description, 2000),
    ...(validUntil ? { validUntil } : {}),
  };
}

function parseRepair(value: unknown): CustomerRepair | null {
  const row = asRecord(value);
  if (!row) return null;

  const publicId = readText(row.public_id, 60);
  const repairNumber = readText(row.repair_number, 100);
  const intakeDate = readDateOnly(row.intake_date);
  const status = readText(row.status, 80);
  const lastUpdatedAt = readTimestamp(row.last_updated_at);
  if (!isUuid(publicId) || !repairNumber || !intakeDate || !status || !lastUpdatedAt) return null;

  const warrantyUntil = readDateOnly(row.warranty_until);
  const budget = parseBudget(row.budget);
  return {
    publicId,
    repairNumber,
    intakeDate,
    deviceType: readText(row.device_type, 160) || "Equipo",
    brand: readText(row.brand, 160),
    model: readText(row.model, 200),
    status,
    publicProgress: readText(row.public_progress, 3000),
    publicNextStep: readText(row.public_next_step, 2000),
    customerActionRequired: readBoolean(row.customer_action_required),
    lastUpdatedAt,
    ...(warrantyUntil ? { warrantyUntil } : {}),
    ...(budget ? { budget } : {}),
  };
}

function parseUpdate(value: unknown): CustomerRepairUpdate | null {
  const row = asRecord(value);
  if (!row) return null;
  const status = readText(row.status, 80);
  const title = readText(row.title, 220);
  const message = readText(row.message, 3000);
  const createdAt = readTimestamp(row.created_at);
  if (!createdAt || (!title && !message && !status)) return null;
  return {
    eventType: readText(row.event_type, 80),
    status,
    title: title || repairStatusLabel(status) || "Actualización",
    message,
    customerActionRequired: readBoolean(row.customer_action_required),
    createdAt,
  };
}

function parseNextCursor(value: unknown): RepairCursor | null {
  const row = asRecord(value);
  if (!row) return null;
  const intakeDate = readDateOnly(row.intake_date);
  const publicId = readText(row.public_id, 60);
  return intakeDate && isUuid(publicId) ? { intakeDate, publicId } : null;
}

function reportRpcError(operation: string, error: { code?: string } | null) {
  console.error(`[customer-repairs] ${operation} failed`, { code: error?.code ?? "unknown" });
}

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function repairStatusLabel(status: string) {
  if (status in repairStatusLabels) return repairStatusLabels[status as RepairStatus];
  const normalized = status.replace(/_/g, " ").trim();
  return normalized
    ? normalized.charAt(0).toLocaleUpperCase("es-AR") + normalized.slice(1)
    : "Estado actualizado";
}

export function repairBudgetStatusLabel(status: string) {
  return repairBudgetStatusLabels[status] ?? repairStatusLabel(status);
}

export function isRepairFinalized(status: string) {
  return FINAL_REPAIR_STATUSES.has(status);
}

export function formatRepairEquipment(
  repair: Pick<CustomerRepair, "deviceType" | "brand" | "model">,
) {
  const identity = [repair.brand, repair.model].filter(Boolean).join(" ");
  return identity ? `${repair.deviceType} · ${identity}` : repair.deviceType;
}

export function repairWhatsAppUrl(
  repair: Pick<CustomerRepair, "repairNumber" | "deviceType" | "brand" | "model">,
) {
  const equipment = cleanWhatsAppText(formatRepairEquipment(repair), 260);
  const repairNumber = cleanWhatsAppText(repair.repairNumber, 100);
  return whatsappUrl(
    `Hola, quiero consultar por la reparación N.º ${repairNumber} correspondiente a ${equipment}.`,
  );
}

export function encodeRepairCursor(cursor: RepairCursor) {
  if (!readDateOnly(cursor.intakeDate) || !isUuid(cursor.publicId)) return "";
  return Buffer.from(
    JSON.stringify({ intake_date: cursor.intakeDate, public_id: cursor.publicId }),
    "utf8",
  ).toString("base64url");
}

export function decodeRepairCursor(value: string | string[] | undefined): RepairCursor | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || candidate.length > 240 || !/^[A-Za-z0-9_-]+$/.test(candidate)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(candidate, "base64url").toString("utf8")) as unknown;
    return parseNextCursor(parsed);
  } catch {
    return null;
  }
}

export function parseCustomerRepairPage(value: unknown): CustomerRepairPage {
  const payload = asRecord(unwrapRpcJson(value));
  if (!payload) return { items: [], nextCursor: null };
  const items = Array.isArray(payload.items)
    ? payload.items.flatMap((item) => {
        const parsed = parseRepair(item);
        return parsed ? [parsed] : [];
      })
    : [];
  return {
    items: items.slice(0, REPAIR_PAGE_SIZE),
    nextCursor: parseNextCursor(payload.next_cursor),
  };
}

export function parseCustomerRepairDetail(value: unknown): CustomerRepairDetail | null {
  const payload = asRecord(unwrapRpcJson(value));
  const repair = parseRepair(payload);
  if (!payload || !repair) return null;
  const updates = Array.isArray(payload.updates)
    ? payload.updates
        .flatMap((entry) => {
          const parsed = parseUpdate(entry);
          return parsed ? [parsed] : [];
        })
        // Defense in depth only: SQL already suppresses budget history whenever
        // the current budget is hidden.
        .filter((update) => repair.budget || update.eventType !== "budget")
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    : [];
  return { ...repair, updates };
}

export function parseCustomerRepairSummary(value: unknown): CustomerRepairSummary {
  const payload = asRecord(unwrapRpcJson(value));
  if (!payload) return EMPTY_REPAIR_SUMMARY;
  return {
    total: readNonNegativeInteger(payload.total),
    active: readNonNegativeInteger(payload.active),
    recentUpdates: readNonNegativeInteger(payload.recent_updates),
  };
}

export async function getMyCustomerRepairs(cursor: RepairCursor | null = null) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_my_customer_repairs", {
    p_cursor_intake_date: cursor?.intakeDate ?? null,
    p_cursor_public_id: cursor?.publicId ?? null,
    p_limit: REPAIR_PAGE_SIZE,
  });
  if (error) {
    reportRpcError("list", error);
    throw new Error("customer_repairs_unavailable");
  }
  return parseCustomerRepairPage(data);
}

export async function getMyCustomerRepair(publicId: string) {
  if (!isUuid(publicId)) return null;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_my_customer_repair", {
    p_public_id: publicId,
  });
  if (error) {
    reportRpcError("detail", error);
    throw new Error("customer_repair_unavailable");
  }
  return parseCustomerRepairDetail(data);
}

export async function getMyCustomerRepairsSummary() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_my_customer_repairs_summary");
  if (error) {
    reportRpcError("summary", error);
    throw new Error("customer_repair_summary_unavailable");
  }
  return parseCustomerRepairSummary(data);
}
