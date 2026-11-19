import { formatPrice } from "@/lib/format";
import { CouponForm, type CouponRow } from "./coupon-form";
import styles from "./coupons.module.css";

const originLabels: Record<CouponRow["origin"], string> = {
  general: "General",
  reel: "Reel o historia",
  taller: "Clientes del taller",
  mostrador: "Mostrador",
};

const shortDate = (value: string) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Cordoba", day: "numeric", month: "long" }).format(new Date(value));

function couponState(coupon: CouponRow, now: number) {
  if (!coupon.is_active) return { tone: "off", text: "Pausado" };
  if (coupon.ends_at && new Date(coupon.ends_at).getTime() <= now) return { tone: "off", text: `Venció el ${shortDate(coupon.ends_at)}` };
  if (coupon.max_uses && coupon.uses >= coupon.max_uses) return { tone: "off", text: "Sin usos disponibles" };
  if (new Date(coupon.starts_at).getTime() > now) return { tone: "wait", text: `Empieza el ${shortDate(coupon.starts_at)}` };
  return { tone: "on", text: coupon.ends_at ? `Vigente hasta el ${shortDate(coupon.ends_at)}` : "Vigente, sin vencimiento" };
}

/** Lista de cupones con su estado y lo que vendió cada uno. `now` llega desde el servidor. */
export function CouponList({ coupons, now }: { coupons: CouponRow[]; now: number }) {
  return (
    <section aria-labelledby="cupones-lista">
      <h2 id="cupones-lista" className={styles.listTitle}>
        {coupons.length ? `Tus cupones (${coupons.length})` : "Todavía no hay cupones"}
      </h2>
      {coupons.length ? (
        <ul className={styles.list}>
          {coupons.map((coupon) => {
            const state = couponState(coupon, now);
            return (
              <li key={coupon.id} className={styles.coupon}>
                <div className={styles.head}>
                  <p className={styles.code}>{coupon.code}</p>
                  <p className={styles.state} data-tone={state.tone}>
                    {state.text}
                  </p>
                </div>
                <p className={styles.terms}>
                  {Number(coupon.percent)} % en {coupon.scope === "all" ? "todos los productos" : "accesorios (sin televisores)"}
                  {Number(coupon.min_subtotal) > 0 ? ` · desde ${formatPrice(Number(coupon.min_subtotal))}` : ""}
                  {coupon.max_discount ? ` · tope ${formatPrice(Number(coupon.max_discount))}` : ""}
                  {coupon.once_per_customer ? " · un uso por cliente" : ""}
                </p>
                <p className={styles.note}>
                  {originLabels[coupon.origin]}
                  {coupon.label ? ` · ${coupon.label}` : ""}
                </p>
                <dl className={styles.stats}>
                  <div>
                    <dt>Usos</dt>
                    <dd>
                      {coupon.uses}
                      {coupon.max_uses ? ` de ${coupon.max_uses}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Pedidos pagados</dt>
                    <dd>{coupon.paid_orders}</dd>
                  </div>
                  <div>
                    <dt>Vendido con el cupón</dt>
                    <dd>{formatPrice(Number(coupon.revenue))}</dd>
                  </div>
                  <div>
                    <dt>Descuento dado</dt>
                    <dd>{formatPrice(Number(coupon.discount_given))}</dd>
                  </div>
                </dl>
                <details className={styles.edit}>
                  <summary>Editar o pausar</summary>
                  <CouponForm coupon={coupon} />
                </details>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.empty}>
          Creá el primero con una de las bases de arriba. Hasta entonces, la compra no muestra el campo de cupón.
        </p>
      )}
    </section>
  );
}
