import Link from "next/link";
import type { AddressRecord } from "@/components/account-forms";
import { formatDate } from "@/lib/date";
import { formatPrice } from "@/lib/format";
import { orderStatusLabels } from "@/lib/orders";
import { formatRepairEquipment, repairStatusLabel, type CustomerRepair } from "@/lib/repairs";
import styles from "./account.module.css";

export type OverviewOrder = {
  id: string;
  order_number: string;
  status: string;
  total: number | string;
  created_at: string;
  payment_method: string | null;
};

type Props = {
  account: { firstName: string; email: string; phone: string; emailVerified: boolean; role: string };
  orders: OverviewOrder[];
  orderCount: number;
  repairs: CustomerRepair[] | null;
  repairCount: number;
  defaultAddress: AddressRecord | null;
  addressCount: number;
  notice?: string | null;
};

// Estados del pedido que piden algo al cliente.
const ORDER_ATTENTION = new Set(["awaiting_payment", "ready_for_pickup"]);

function orderHref(order: OverviewOrder) {
  return order.payment_method ? `/pedido/${encodeURIComponent(order.order_number)}` : `/cuenta/pedidos/${order.id}`;
}

function addressLine(address: AddressRecord) {
  return [
    `${address.street ?? ""} ${address.street_number ?? ""}`.trim(),
    address.floor ? `piso ${address.floor}` : "",
    address.apartment ? `depto. ${address.apartment}` : "",
    address.city,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Resumen de la cuenta: pedidos, reparaciones y datos en una sola vista. */
export function AccountOverview({
  account,
  orders,
  orderCount,
  repairs,
  repairCount,
  defaultAddress,
  addressCount,
  notice,
}: Props) {
  const isCustomer = account.role === "customer";
  return (
    <>
      <header className={styles.heading}>
        <h1>Hola, {account.firstName || "bienvenido"}</h1>
        <p>Tus pedidos, tus reparaciones y tus datos, en una sola vista.</p>
      </header>

      {notice ? (
        <p className="aviso" role="alert">
          {notice}
        </p>
      ) : null}

      {!account.emailVerified ? (
        <div className={styles.notice}>
          <span>Todavía no confirmaste tu mail. Sin confirmarlo no podemos asociarte las compras que hiciste sin cuenta.</span>
          <Link href={`/verificar-correo?email=${encodeURIComponent(account.email)}`} className="enlace">
            Reenviar el enlace
          </Link>
        </div>
      ) : null}

      <section className={styles.block} aria-labelledby="resumen-pedidos">
        <div className={styles.blockHead}>
          <h2 id="resumen-pedidos">Pedidos</h2>
          {orderCount > orders.length ? (
            <Link href="/cuenta/pedidos" className="enlace">
              Ver los {orderCount}
            </Link>
          ) : null}
        </div>
        {orders.length ? (
          <ul className={styles.rows}>
            {orders.map((order) => (
              <li key={order.id}>
                <Link href={orderHref(order)} className={styles.row}>
                  <span className={styles.rowTitle}>{order.order_number}</span>
                  <span className={styles.rowMeta}>{formatDate(order.created_at)}</span>
                  <span className={styles.rowSide}>
                    <strong>{formatPrice(Number(order.total))}</strong>
                    <span className={styles.state} data-attention={ORDER_ATTENTION.has(order.status)}>
                      {orderStatusLabels[order.status] ?? order.status}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <p>Todavía no compraste con esta cuenta.</p>
            <Link href="/productos" className="enlace">
              Ver productos
            </Link>
          </div>
        )}
      </section>

      {isCustomer ? (
        <section className={styles.block} aria-labelledby="resumen-reparaciones">
          <div className={styles.blockHead}>
            <h2 id="resumen-reparaciones">Reparaciones</h2>
            {repairCount > (repairs?.length ?? 0) ? (
              <Link href="/cuenta/reparaciones" className="enlace">
                Ver las {repairCount}
              </Link>
            ) : null}
          </div>
          {repairs === null ? (
            <div className={styles.empty}>
              <p>No pudimos cargar tus reparaciones ahora.</p>
              <Link href="/cuenta/reparaciones" className="enlace">
                Probar de nuevo
              </Link>
            </div>
          ) : repairs.length ? (
            <ul className={styles.rows}>
              {repairs.map((repair) => (
                <li key={repair.publicId}>
                  <Link href={`/cuenta/reparaciones/${repair.publicId}`} className={styles.row}>
                    <span className={styles.rowTitle}>{formatRepairEquipment(repair)}</span>
                    <span className={styles.rowMeta}>
                      Orden {repair.repairNumber} · actualizada el {formatDate(repair.lastUpdatedAt)}
                    </span>
                    <span className={styles.rowSide}>
                      <span
                        className={styles.state}
                        data-attention={repair.customerActionRequired || repair.status === "listo_para_retirar"}
                      >
                        {repair.customerActionRequired ? "Necesita tu respuesta" : repairStatusLabel(repair.status)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.empty}>
              <p>Cuando dejes un equipo en el taller, lo seguís desde acá.</p>
              <Link href="/servicio-tecnico" className="enlace">
                Ver el servicio técnico
              </Link>
            </div>
          )}
        </section>
      ) : null}

      <section className={styles.block} aria-labelledby="resumen-datos">
        <div className={styles.blockHead}>
          <h2 id="resumen-datos">Tus datos</h2>
        </div>
        <dl className={styles.facts}>
          <div>
            <dt>Mail</dt>
            <dd>{account.email}</dd>
          </div>
          <div>
            <dt>Teléfono</dt>
            <dd>{account.phone || "Sin cargar"}</dd>
          </div>
          <div>
            <dt>Dirección de envío</dt>
            <dd>{defaultAddress ? addressLine(defaultAddress) : "Sin cargar"}</dd>
          </div>
          <div>
            <dt>Direcciones guardadas</dt>
            <dd>{addressCount}</dd>
          </div>
        </dl>
        <div className={styles.links}>
          <Link href="/cuenta/perfil" className="enlace">
            Editar mis datos
          </Link>
          <Link href="/cuenta/direcciones" className="enlace">
            {addressCount ? "Administrar direcciones" : "Agregar una dirección"}
          </Link>
        </div>
      </section>
    </>
  );
}
