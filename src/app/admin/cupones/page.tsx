import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CouponForm, type CouponRow } from "./coupon-form";
import { CouponList } from "./coupon-list";
import styles from "./coupons.module.css";

export const metadata = { title: "Cupones" };

async function requestTime() {
  // La página se arma en cada pedido: la hora sirve para saber qué cupones siguen vigentes.
  await connection();
  return Date.now();
}

export default async function AdminCouponsPage() {
  await requireAdmin("/admin/cupones");
  const supabase = await createServerSupabaseClient();
  const [{ data, error }, now] = await Promise.all([supabase.rpc("storefront_admin_coupons"), requestTime()]);
  const coupons = (Array.isArray(data) ? data : []) as CouponRow[];

  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">Promoción</p>
        <h1>Cupones</h1>
        <p>
          Un cupón es un código corto que el cliente escribe al comprar. Decilo en un reel o anotalo en el comprobante
          del taller: acá ves cuántas ventas trajo cada uno, aunque nadie toque un enlace.
        </p>
      </div>

      {error ? (
        <p className={styles.message} data-kind="error" role="alert">
          No pudimos cargar los cupones. Recargá la página.
        </p>
      ) : null}

      <section className={styles.panel} aria-labelledby="cupon-nuevo">
        <h2 id="cupon-nuevo">Cupón nuevo</h2>
        <CouponForm />
      </section>

      <CouponList coupons={coupons} now={now} />
    </>
  );
}
