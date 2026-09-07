import Link from "next/link";
import { formatPrice } from "@/lib/format";

export function AdminProductTable({
  products,
  empty = "No encontramos productos.",
}: {
  products: Array<Record<string, unknown>>;
  empty?: string;
}) {
  if (!products.length)
    return (
      <div className="empty-state">
        <h2>{empty}</h2>
      </div>
    );
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>SKU</th>
            <th>Categoría</th>
            <th>Condición</th>
            <th>Precio fuente</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={String(product.id)}>
              <td>
                <strong>{String(product.name)}</strong>
                <span>
                  {String(product.brand ?? "")} {String(product.model ?? "")}
                </span>
              </td>
              <td>{String(product.sku)}</td>
              <td>{String(product.category_name)}</td>
              <td>{String(product.condition)}</td>
              <td>{formatPrice(Number(product.public_price))}</td>
              <td>
                <span
                  className={`status-pill ${product.is_published && !product.archived_at ? "active" : ""}`}
                >
                  {product.archived_at
                    ? "Archivado"
                    : product.is_published
                      ? "Publicado"
                      : "Oculto"}
                </span>
              </td>
              <td>
                <Link className="text-link" href={`/admin/productos/${product.id}`}>
                  Editar
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
