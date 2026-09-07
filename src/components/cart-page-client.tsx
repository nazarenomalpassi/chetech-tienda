"use client";

import Link from "next/link";
import { ArrowLeft, LogIn, Minus, Plus, RefreshCw, ShoppingBag, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { formatPrice } from "@/lib/format";

type Address = {
  id: string;
  label: string;
  recipient_name: string;
  street: string;
  street_number: string;
  city: string;
  province: string;
  postal_code: string;
  is_default: boolean;
};

export function CartPageClient({
  account,
  addresses,
}: {
  account: { fullName: string; phone: string; emailVerified: boolean; active: boolean } | null;
  addresses: Address[];
}) {
  const { items, update, remove, clear } = useCart();
  const [details, setDetails] = useState({
    name: account?.fullName ?? "",
    phone: account?.phone ?? "",
    deliveryMethod: "coordinate",
    addressId: addresses.find((address) => address.is_default)?.id ?? addresses[0]?.id ?? "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [priceChanged, setPriceChanged] = useState(false);
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  async function checkout(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setPriceChanged(false);
    try {
      const response = await fetch("/api/checkout/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            id: item.product.id,
            quantity: item.quantity,
            expectedPrice: item.product.price,
          })),
          details,
        }),
      });
      const result = (await response.json()) as { url?: string; message?: string; code?: string };
      if (!response.ok || !result.url) {
        if (result.code === "PRICE_CHANGED") setPriceChanged(true);
        throw new Error(result.message || "No pudimos crear el pedido.");
      }
      clear();
      window.location.assign(result.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos crear el pedido.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!items.length)
    return (
      <section className="section shell empty-cart">
        <ShoppingBag />
        <h1>Tu carrito está vacío</h1>
        <p>Explorá el catálogo y guardá todo lo que quieras consultar.</p>
        <Link className="button primary" href="/productos">
          Ver productos
        </Link>
      </section>
    );
  return (
    <section className="section shell cart-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Tu selección</p>
          <h1>Carrito</h1>
        </div>
        <button className="text-button" onClick={clear}>
          Vaciar carrito
        </button>
      </div>
      <div className="cart-layout">
        <div className="cart-items">
          {items.map(({ product, quantity }) => (
            <article key={product.id}>
              <div>
                <p className="eyebrow">{product.condition}</p>
                <h2>
                  <Link href={`/productos/${product.slug}`}>{product.name}</Link>
                </h2>
                <p>{formatPrice(product.price)}</p>
              </div>
              <div className="quantity">
                <button
                  type="button"
                  onClick={() => update(product.id, quantity - 1)}
                  aria-label="Restar cantidad"
                >
                  <Minus />
                </button>
                <span>{quantity}</span>
                <button
                  type="button"
                  onClick={() => update(product.id, quantity + 1)}
                  aria-label="Sumar cantidad"
                >
                  <Plus />
                </button>
              </div>
              <strong>{formatPrice(product.price * quantity)}</strong>
              <button
                className="remove"
                type="button"
                onClick={() => remove(product.id)}
                aria-label={`Quitar ${product.name}`}
              >
                <Trash2 />
              </button>
            </article>
          ))}
        </div>
        <form className="checkout-card" onSubmit={checkout}>
          <p className="eyebrow">Finalizar pedido</p>
          <h2>Total estimado</h2>
          <div className="checkout-total">{formatPrice(total)}</div>
          <p className="shipping-pending">Costo de envío a confirmar según destino.</p>
          {!account ? (
            <div className="checkout-login">
              <LogIn />
              <strong>Ingresá para continuar</strong>
              <p>Tu carrito queda guardado y volvés a esta pantalla después del acceso.</p>
              <Link className="button primary" href="/ingresar?next=/carrito">
                Ingresar o crear cuenta
              </Link>
            </div>
          ) : !account.active ? (
            <p className="form-message error">La cuenta no está activa.</p>
          ) : !account.emailVerified ? (
            <div className="checkout-login">
              <strong>Verificá tu correo</strong>
              <p>Por seguridad, necesitamos confirmar tu correo antes de crear el pedido.</p>
              <Link className="button primary" href="/verificar-correo">
                Reenviar verificación
              </Link>
            </div>
          ) : (
            <>
              <label>
                Nombre
                <input
                  maxLength={160}
                  autoComplete="name"
                  value={details.name}
                  onChange={(event) => setDetails({ ...details, name: event.target.value })}
                  required
                />
              </label>
              <label>
                Teléfono
                <input
                  maxLength={40}
                  autoComplete="tel"
                  value={details.phone}
                  onChange={(event) => setDetails({ ...details, phone: event.target.value })}
                  required
                />
              </label>
              <label>
                Modalidad
                <select
                  value={details.deliveryMethod}
                  onChange={(event) =>
                    setDetails({ ...details, deliveryMethod: event.target.value })
                  }
                >
                  <option value="coordinate">A coordinar</option>
                  <option value="pickup">Retiro en el local</option>
                  <option value="shipping">Envío</option>
                </select>
              </label>
              {details.deliveryMethod === "shipping" && (
                <label>
                  Dirección de envío
                  {addresses.length ? (
                    <select
                      value={details.addressId}
                      onChange={(event) =>
                        setDetails({ ...details, addressId: event.target.value })
                      }
                      required
                    >
                      {addresses.map((address) => (
                        <option key={address.id} value={address.id}>
                          {address.label}: {address.street} {address.street_number}, {address.city}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="field-help">
                      Primero <Link href="/cuenta/direcciones">guardá una dirección</Link>.
                    </span>
                  )}
                </label>
              )}
              <label>
                Observaciones
                <textarea
                  maxLength={1000}
                  rows={3}
                  value={details.notes}
                  onChange={(event) => setDetails({ ...details, notes: event.target.value })}
                />
              </label>
              <button
                className="button whatsapp"
                type="submit"
                disabled={
                  submitting || (details.deliveryMethod === "shipping" && !addresses.length)
                }
              >
                {submitting ? "Creando pedido…" : "Crear pedido y abrir WhatsApp"}
              </button>
            </>
          )}
          {error && (
            <p className="checkout-error" role="alert">
              {error}
            </p>
          )}
          {priceChanged && (
            <button
              className="button secondary"
              type="button"
              onClick={() => window.location.reload()}
            >
              <RefreshCw />
              Actualizar carrito
            </button>
          )}
          <small>
            Antes de registrar el pedido volvemos a verificar publicación, precio y stock. La compra
            queda pendiente de confirmación.
          </small>
          <nav className="checkout-policies">
            <Link href="/garantias">Garantías</Link>
            <Link href="/cambios-y-devoluciones">Cambios y devoluciones</Link>
            <Link href="/terminos-y-condiciones">Términos</Link>
          </nav>
        </form>
      </div>
      <Link className="text-link" href="/productos">
        <ArrowLeft /> Seguir explorando
      </Link>
    </section>
  );
}
