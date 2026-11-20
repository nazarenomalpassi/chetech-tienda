import { requireAdmin } from "@/lib/auth";
import { getProducts } from "@/lib/catalog";
import { mailEnabled } from "@/lib/mail/outbox";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  canAutoNotify,
  waitlistMatch,
  waitlistSubject,
  type WaitlistEntry,
} from "@/lib/waitlist-match";
import styles from "../inbox.module.css";
import { WaitlistBoard, type WaitlistRow } from "./waitlist-board";

export const metadata = { title: "Lista de espera" };

const COLUMNS =
  "id,kind,storefront_product_id,query,contact_name,email,phone,created_at,notified_at";

export default async function AdminWaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  await requireAdmin("/admin/lista-de-espera");
  const view = (await searchParams).vista === "avisados" ? "avisados" : "pendientes";
  const supabase = await createServerSupabaseClient();

  let listQuery = supabase.from("storefront_waitlist").select(COLUMNS).limit(300);
  listQuery =
    view === "pendientes"
      ? listQuery.is("notified_at", null).order("created_at", { ascending: true })
      : listQuery.not("notified_at", "is", null).order("notified_at", { ascending: false });

  const [{ data, error }, pending, done, products] = await Promise.all([
    listQuery,
    supabase
      .from("storefront_waitlist")
      .select("id", { count: "exact", head: true })
      .is("notified_at", null),
    supabase
      .from("storefront_waitlist")
      .select("id", { count: "exact", head: true })
      .not("notified_at", "is", null),
    getProducts(),
  ]);

  const rows: WaitlistRow[] = ((data ?? []) as WaitlistEntry[]).map((entry) => {
    const match = waitlistMatch(entry, products);
    return {
      ...entry,
      subject: waitlistSubject(entry, products),
      auto: canAutoNotify(entry),
      match: match ? { name: match.name, slug: match.slug, price: match.price } : null,
    };
  });
  // Primero los que ya se pueden avisar.
  if (view === "pendientes")
    rows.sort((a, b) => Number(Boolean(b.match)) - Number(Boolean(a.match)));

  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">Clientes</p>
        <h1>Lista de espera</h1>
        <p>
          Personas que pidieron que les avisen cuando entre un producto, una tele revisada o una
          placa. Les prometimos escribirles una sola vez: cuando haya stock, avisales y marcalas
          como avisadas.
        </p>
      </div>

      {error ? (
        <p className={styles.message} data-kind="error" role="alert">
          No pudimos cargar la lista. Recargá la página.
        </p>
      ) : null}

      <WaitlistBoard
        rows={rows}
        view={view}
        counts={{ pendientes: pending.count ?? 0, avisados: done.count ?? 0 }}
        site={(process.env.NEXT_PUBLIC_SITE_URL ?? "https://chetechstore.com").replace(/\/$/, "")}
        mailOn={mailEnabled()}
      />
    </>
  );
}
