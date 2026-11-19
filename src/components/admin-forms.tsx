"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  updateOrderAction,
  updateStorefrontProductAction,
  type AdminActionState,
} from "@/app/admin-actions";
import { families } from "@/config/catalog";
import { orderStatusLabels, orderStatuses } from "@/lib/orders";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button className="button primary" disabled={pending}>
      {pending ? "Guardando…" : children}
    </button>
  );
}
function Feedback({ state }: { state: AdminActionState }) {
  return (
    <>
      {state.error && (
        <p className="form-message error" role="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="form-message success" role="status">
          {state.message}
        </p>
      )}
    </>
  );
}

type ProductRecord = Record<string, unknown>;
export function AdminProductForm({ product }: { product: ProductRecord }) {
  const [state, action] = useActionState(updateStorefrontProductAction, {});
  const models = Array.isArray(product.compatible_models)
    ? product.compatible_models.join("\n")
    : "";
  return (
    <form className="admin-edit-form" action={action}>
      <input type="hidden" name="id" value={String(product.id)} />
      <section>
        <h2>Información comercial</h2>
        <div className="account-form-grid">
          <label>
            Nombre público
            <input name="name" defaultValue={String(product.name ?? "")} maxLength={200} required />
          </label>
          <label>
            SKU
            <input value={String(product.sku ?? "")} readOnly />
          </label>
          <label>
            Marca
            <input name="brand" defaultValue={String(product.brand ?? "")} maxLength={120} />
          </label>
          <label>
            Modelo
            <input name="model" defaultValue={String(product.model ?? "")} maxLength={160} />
          </label>
          <label>
            Condición
            <select name="condition" defaultValue={String(product.condition ?? "Nuevo")}>
              <option>Nuevo</option>
              <option>Usado</option>
              <option>Reacondicionado</option>
            </select>
          </label>
          <label>
            Precio desde el sistema interno
            <input
              value={Number(product.public_price).toLocaleString("es-AR", {
                style: "currency",
                currency: "ARS",
              })}
              readOnly
            />
          </label>
        </div>
        <p className="admin-source-note">
          El precio, stock y categoría provienen del sistema administrativo del local. Se muestran
          como solo lectura para evitar inconsistencias y pueden sobrescribirse en la próxima
          sincronización.
        </p>
        <label>
          Descripción breve
          <textarea
            name="shortDescription"
            defaultValue={String(product.short_description ?? "")}
            rows={3}
            maxLength={800}
          />
        </label>
        <label>
          Descripción completa
          <textarea
            name="description"
            defaultValue={String(product.description ?? "")}
            rows={7}
            maxLength={5000}
            required
          />
        </label>
        <label>
          Garantía informada
          <textarea
            name="warranty"
            defaultValue={String(product.warranty ?? "A confirmar")}
            rows={2}
            maxLength={500}
          />
        </label>
      </section>
      <section>
        <h2>Para que se venda solo</h2>
        <p className="admin-source-note">
          Estos datos arman la etiqueta técnica de la ficha, los filtros del catálogo y las opciones de envío.
        </p>
        <div className="account-form-grid">
          <label>
            Familia
            <select name="familyOverride" defaultValue={String(product.family_override ?? "")}>
              <option value="">Según la categoría de la gestión</option>
              {families.map((family) => (
                <option key={family.slug} value={family.slug}>
                  {family.name}
                </option>
              ))}
              <option value="otros">Otros</option>
            </select>
          </label>
          <label>
            Tamaño de envío
            <select name="shippingSize" defaultValue={String(product.shipping_size ?? "")}>
              <option value="">Sin definir</option>
              <option value="chico">Chico (entra en una caja de zapatos)</option>
              <option value="mediano">Mediano</option>
              <option value="grande">Grande</option>
              <option value="no_viaja">No viaja por correo</option>
            </select>
          </label>
          <label>
            Garantía en meses
            <input
              name="warrantyMonths"
              type="number"
              min={0}
              max={60}
              inputMode="numeric"
              defaultValue={product.warranty_months === null || product.warranty_months === undefined ? "" : String(product.warranty_months)}
              placeholder="Vacío: mínimo legal (6 nuevo, 3 usado)"
            />
          </label>
          <label>
            Video (Instagram o YouTube)
            <input name="videoUrl" type="url" defaultValue={String(product.video_url ?? "")} maxLength={500} placeholder="https://" />
          </label>
        </div>
        <label>
          Qué trae la caja
          <textarea name="boxContents" defaultValue={String(product.box_contents ?? "")} rows={2} maxLength={1000} placeholder="Control, cable HDMI, fuente" />
        </label>
        <label>
          Sirve con, uno por línea
          <textarea
            name="compatibleWith"
            defaultValue={Array.isArray(product.compatible_with) ? product.compatible_with.join("\n") : ""}
            rows={3}
            maxLength={2000}
            placeholder={"Smart TV con HDMI\niPhone 15"}
          />
        </label>
      </section>
      <section>
        <h2>Publicación e imagen</h2>
        <label>
          URL de imagen principal
          <input
            name="primaryImageUrl"
            type="url"
            defaultValue={String(product.primary_image_url ?? "")}
            maxLength={1000}
          />
        </label>
        <div className="admin-check-grid">
          <label>
            <input
              type="checkbox"
              name="isPublished"
              defaultChecked={Boolean(product.is_published)}
            />{" "}
            Publicado
          </label>
          <label>
            <input
              type="checkbox"
              name="isFeatured"
              defaultChecked={Boolean(product.is_featured)}
            />{" "}
            Destacado
          </label>
          <label>
            <input type="checkbox" name="isOffer" defaultChecked={Boolean(product.is_offer)} />{" "}
            Oferta
          </label>
          <label>
            <input type="checkbox" name="isNew" defaultChecked={Boolean(product.is_new)} /> Nuevo
            ingreso
          </label>
          <label>
            <input
              type="checkbox"
              name="shippingEnabled"
              defaultChecked={Boolean(product.shipping_enabled)}
            />{" "}
            Permite envío
          </label>
          <label>
            <input
              type="checkbox"
              name="pickupEnabled"
              defaultChecked={Boolean(product.pickup_enabled)}
            />{" "}
            Permite retiro
          </label>
          <label className="danger">
            <input type="checkbox" name="archived" defaultChecked={Boolean(product.archived_at)} />{" "}
            Archivar y despublicar
          </label>
        </div>
      </section>
      <section>
        <h2>Datos específicos de placa</h2>
        <div className="account-form-grid">
          <label>
            Código de placa
            <input
              name="boardCode"
              defaultValue={String(product.board_code ?? "")}
              maxLength={160}
            />
          </label>
          <label>
            Número de parte
            <input
              name="partNumber"
              defaultValue={String(product.part_number ?? "")}
              maxLength={160}
            />
          </label>
          <label>
            Tipo de placa
            <input
              name="boardType"
              defaultValue={String(product.board_type ?? "")}
              maxLength={120}
            />
          </label>
        </div>
        <label>
          Modelos compatibles, uno por línea
          <textarea name="compatibleModels" defaultValue={models} rows={5} maxLength={3000} />
        </label>
        <label>
          Notas técnicas
          <textarea
            name="boardNotes"
            defaultValue={String(product.board_notes ?? "")}
            rows={4}
            maxLength={2000}
          />
        </label>
      </section>
      <Feedback state={state} />
      <Submit>Guardar producto</Submit>
    </form>
  );
}

export function AdminOrderForm({ order }: { order: Record<string, unknown> }) {
  const [state, action] = useActionState(updateOrderAction, {});
  return (
    <form className="admin-edit-form" action={action}>
      <input type="hidden" name="id" value={String(order.id)} />
      <section>
        <h2>Gestión del pedido</h2>
        <label>
          Estado
          <select name="status" defaultValue={String(order.status)}>
            {orderStatuses.map((status) => (
              <option key={status} value={status}>
                {orderStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nota visible para el cliente
          <textarea name="customerVisibleNote" rows={3} maxLength={1000} />
        </label>
        <label>
          Notas internas
          <textarea
            name="adminNotes"
            defaultValue={String(order.admin_notes ?? "")}
            rows={5}
            maxLength={4000}
          />
        </label>
        <p className="admin-source-note">
          Las notas internas nunca se muestran en “Mi cuenta”. Cada cambio de estado registra
          administrador, fecha y estado anterior.
        </p>
      </section>
      <Feedback state={state} />
      <Submit>Actualizar pedido</Submit>
    </form>
  );
}
