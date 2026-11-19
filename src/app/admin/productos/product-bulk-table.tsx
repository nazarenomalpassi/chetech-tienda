"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { bulkProductAction } from "@/app/admin-actions";
import { families } from "@/config/catalog";
import { formatPrice } from "@/lib/format";
import { missingKinds, type MissingKind } from "./product-missing";
import styles from "./products.module.css";

type Row = {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  price: number;
  image: string | null;
  family: string;
  published: boolean;
  archived: boolean;
  missing: MissingKind[];
};

const missingLabel = Object.fromEntries(missingKinds.map((kind) => [kind.key, kind.label])) as Record<MissingKind, string>;
const familyName = (slug: string) => families.find((family) => family.slug === slug)?.name ?? "Sin familia";

function Apply({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" disabled={pending || count === 0} aria-busy={pending}>
      {pending ? "Aplicando…" : `Aplicar a ${count}`}
    </button>
  );
}

export function ProductBulkTable({ rows }: { rows: Row[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, action] = useActionState(bulkProductAction, {});
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const ids = useMemo(() => [...selected], [selected]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!rows.length) return <p className={styles.empty}>No hay productos con estos filtros.</p>;

  return (
    <form action={action}>
      {ids.map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}
      <div className={styles.bulk} data-active={ids.length > 0}>
        <strong>{ids.length ? `${ids.length} elegidos` : "Elegí productos para cambiarlos juntos"}</strong>
        <label>
          Familia
          <select name="bulkFamily" defaultValue="">
            <option value="">Sin cambios</option>
            {families.map((family) => (
              <option key={family.slug} value={family.slug}>
                {family.name}
              </option>
            ))}
            <option value="__auto">Según la categoría</option>
          </select>
        </label>
        <label>
          Envío
          <select name="bulkShippingSize" defaultValue="">
            <option value="">Sin cambios</option>
            <option value="chico">Chico</option>
            <option value="mediano">Mediano</option>
            <option value="grande">Grande</option>
            <option value="no_viaja">No viaja por correo</option>
          </select>
        </label>
        <label>
          Garantía
          <select name="bulkWarranty" defaultValue="">
            <option value="">Sin cambios</option>
            <option value="3">3 meses</option>
            <option value="6">6 meses</option>
            <option value="12">12 meses</option>
          </select>
        </label>
        <label>
          Publicación
          <select name="bulkPublication" defaultValue="">
            <option value="">Sin cambios</option>
            <option value="publish">Publicar</option>
            <option value="unpublish">Ocultar</option>
          </select>
        </label>
        <Apply count={ids.length} />
        {state.error ? (
          <p className={styles.message} data-kind="error" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.message ? (
          <p className={styles.message} data-kind="ok" role="status">
            {state.message}
          </p>
        ) : null}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">
                <input
                  type="checkbox"
                  aria-label="Elegir todos"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))}
                />
              </th>
              <th scope="col">Producto</th>
              <th scope="col">Familia</th>
              <th scope="col" className={styles.num}>
                Precio
              </th>
              <th scope="col">Le falta</th>
              <th scope="col">
                <span className="sr-only">Editar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-selected={selected.has(row.id)}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Elegir ${row.name}`}
                    checked={selected.has(row.id)}
                    onChange={() => toggle(row.id)}
                  />
                </td>
                <td>
                  <div className={styles.product}>
                    {row.image ? (
                      <Image src={row.image} alt="" width={44} height={44} className={styles.thumb} />
                    ) : (
                      <span className={styles.thumb} aria-hidden="true" />
                    )}
                    <div>
                      <strong>{row.name}</strong>
                      <small>
                        {row.sku}
                        {row.brand ? ` · ${row.brand}` : ""}
                        {row.archived ? " · Archivado" : row.published ? "" : " · Oculto"}
                      </small>
                    </div>
                  </div>
                </td>
                <td>{familyName(row.family)}</td>
                <td className={styles.num}>{formatPrice(row.price)}</td>
                <td>
                  {row.missing.length ? (
                    <ul className={styles.chips}>
                      {row.missing.map((kind) => (
                        <li key={kind}>{missingLabel[kind]}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className={styles.done}>Completo</span>
                  )}
                </td>
                <td>
                  <Link className="enlace" href={`/admin/productos/${row.id}`}>
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
