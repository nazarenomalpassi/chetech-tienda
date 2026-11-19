"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { measurementContext, readAttribution } from "@/lib/attribution";
import { formatPrice } from "@/lib/format";
import type { StoreSettings } from "@/lib/store-settings";
import { trackEvent } from "@/lib/track";
import { cartWhatsApp } from "@/lib/whatsapp";
import styles from "./checkout.module.css";

type Props = { payments: StoreSettings["payments"]; delivery: StoreSettings["delivery"] };
type DeliveryKind = "pickup" | "local" | "shipping";
type PaymentKind = "mercadopago" | "transfer" | "pickup";

const SAVED_KEY = "chetech-datos-compra-v1";
const sizeRank = { chico: 1, mediano: 2, grande: 3, no_viaja: 4 } as const;

export function CheckoutClient({ payments, delivery }: Props) {
  const router = useRouter();
  const { items, subtotal, update, remove, clear } = useCart();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [remember, setRemember] = useState(false);
  const [kind, setKind] = useState<DeliveryKind>("pickup");
  const [zone, setZone] = useState(delivery.localZones[0]?.id ?? "");
  const [address, setAddress] = useState({ street: "", number: "", apartment: "", city: "Río Tercero", province: "Córdoba", postal_code: "5850", notes: "" });
  const [payment, setPayment] = useState<PaymentKind | null>(null);
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onlineEnabled = payments.mercadopago || payments.transfer || payments.pickupPayment;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "null") as { name?: string; email?: string; phone?: string } | null;
      if (saved) {
        setName(saved.name ?? "");
        setEmail(saved.email ?? "");
        setPhone(saved.phone ?? "");
        setRemember(true);
      }
    } catch {
      // Sin datos guardados.
    }
  }, []);

  useEffect(() => {
    if (!items.length) return;
    trackEvent("begin_checkout", {
      value: subtotal,
      items: items.map(({ product, quantity }) => ({ id: product.id, name: product.name, price: product.price, quantity, family: product.familyName })),
    });
    // Una vez al entrar al carrito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const largest = useMemo(
    () => items.reduce((max, { product }) => Math.max(max, sizeRank[product.shippingSize ?? "chico"] ?? 1), 1),
    [items],
  );
  const cannotShip = items.some(({ product }) => product.shippingSize === "no_viaja" || !product.shipping);
  const correoRate =
    largest >= 4 ? null : delivery.correoRates[largest === 1 ? "chico" : largest === 2 ? "mediano" : "grande"] ?? null;

  const deliveryOptions = [
    delivery.pickup ? { kind: "pickup" as const, title: "Retiro en el local", detail: "Independencia 784, Río Tercero.", price: 0 } : null,
    delivery.local && delivery.localZones.length
      ? { kind: "local" as const, title: "Entrega CheTech", detail: "Te lo llevamos en Río Tercero y zona.", price: delivery.localZones.find((item) => item.id === zone)?.price ?? 0 }
      : null,
    delivery.correo && !cannotShip && correoRate !== null
      ? { kind: "shipping" as const, title: "Correo Argentino", detail: "A domicilio en todo el país.", price: correoRate }
      : null,
  ].filter(Boolean) as { kind: DeliveryKind; title: string; detail: string; price: number }[];

  const shipping = deliveryOptions.find((option) => option.kind === kind)?.price ?? 0;
  const total = subtotal + shipping;

  const paymentOptions = [
    payments.mercadopago
      ? { kind: "mercadopago" as const, title: "Mercado Pago", detail: "Tarjeta de crédito o débito, dinero en cuenta o efectivo. No hace falta tener cuenta." }
      : null,
    payments.transfer
      ? { kind: "transfer" as const, title: "Transferencia", detail: `Te reservamos el pedido ${payments.offlineReservationHours} horas hábiles para que transfieras.` }
      : null,
    payments.pickupPayment && kind === "pickup" && (payments.pickupPaymentMax === null || total <= payments.pickupPaymentMax)
      ? { kind: "pickup" as const, title: "Pagar al retirar", detail: "Efectivo, transferencia, Mercado Pago o Naranja X en el local." }
      : null,
  ].filter(Boolean) as { kind: PaymentKind; title: string; detail: string }[];

  // Si la opción elegida deja de estar disponible (por ejemplo, al cambiar la entrega), se corrige en el
  // mismo render: React vuelve a dibujar antes de mostrar nada.
  const availableDelivery = deliveryOptions.map((option) => option.kind);
  if (availableDelivery.length && !availableDelivery.includes(kind)) setKind(availableDelivery[0]);
  const availablePayments = paymentOptions.map((option) => option.kind);
  if (payment && !availablePayments.includes(payment)) setPayment(null);
  else if (!payment && availablePayments.length === 1) setPayment(availablePayments[0]);

  if (!items.length) {
    return (
      <div className={`page ${styles.empty}`}>
        <h1>Tu carrito está vacío</h1>
        <p>Elegí lo que necesitás y volvé acá para terminar la compra.</p>
        <Link href="/productos" className="btn" data-size="large">
          Ver productos
        </Link>
      </div>
    );
  }

  const saveData = () => {
    try {
      if (remember) localStorage.setItem(SAVED_KEY, JSON.stringify({ name, email, phone }));
      else localStorage.removeItem(SAVED_KEY);
    } catch {
      // Navegación privada.
    }
  };

  const sendWhatsApp = (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 3) {
      setError("Escribí tu nombre para reservar el pedido.");
      return;
    }
    saveData();
    const url = cartWhatsApp(
      items.map(({ product, quantity }) => ({ name: product.name, sku: product.sku, quantity, price: product.price })),
      { name, notes },
      subtotal,
    );
    window.open(url, "_blank", "noopener");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!payment) {
      setError("Elegí cómo vas a pagar.");
      return;
    }
    setSending(true);
    saveData();
    try {
      const attribution = readAttribution();
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map(({ product, quantity }) => ({ id: product.id, quantity })),
          customer: { name, email, phone },
          delivery: { kind, zone, address },
          payment_method: payment,
          notes,
          marketing_consent: consent,
          attribution: { ...attribution, ...measurementContext() },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirect?: string;
        orderUrl?: string;
        paymentError?: string | null;
      };
      if (!response.ok || !payload.redirect) throw new Error(payload.error ?? "No pudimos crear el pedido. Probá de nuevo.");
      clear();
      if (payload.redirect.startsWith("http")) window.location.href = payload.redirect;
      else router.push(payload.redirect + (payload.paymentError ? "&aviso=mp" : ""));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos crear el pedido. Probá de nuevo.");
      setSending(false);
    }
  };

  const submitLabel =
    payment === "mercadopago" ? "Pagar con Mercado Pago" : payment === "transfer" ? "Confirmar y ver los datos para transferir" : "Confirmar pedido";

  return (
    <div className={`page ${styles.page}`}>
      <h1 className={styles.title}>Finalizar compra</h1>
      <form className={styles.layout} onSubmit={onlineEnabled ? submit : sendWhatsApp}>
        <div className={styles.main}>
          <section className={styles.section} aria-labelledby="pedido-titulo">
            <h2 id="pedido-titulo">Tu pedido</h2>
            <ul className={styles.items}>
              {items.map(({ product, quantity }) => (
                <li key={product.id}>
                  <Link href={`/productos/${product.slug}`} className={styles.thumb}>
                    {product.image ? <Image src={product.image} alt="" fill sizes="64px" /> : null}
                  </Link>
                  <div className={styles.itemText}>
                    <Link href={`/productos/${product.slug}`}>{product.name}</Link>
                    <span className={styles.unit}>{formatPrice(product.price)} c/u</span>
                  </div>
                  <div className={styles.stepper} role="group" aria-label={`Cantidad de ${product.name}`}>
                    <button
                      type="button"
                      aria-label={quantity > 1 ? "Quitar una unidad" : "Sacar del carrito"}
                      onClick={() => (quantity > 1 ? update(product.id, quantity - 1) : remove(product.id))}
                    >
                      {quantity > 1 ? <Minus aria-hidden size={16} /> : <Trash2 aria-hidden size={16} />}
                    </button>
                    <output>{quantity}</output>
                    <button type="button" aria-label="Sumar una unidad" disabled={quantity >= 10} onClick={() => update(product.id, quantity + 1)}>
                      <Plus aria-hidden size={16} />
                    </button>
                  </div>
                  <span className={`price ${styles.itemTotal}`}>{formatPrice(product.price * quantity)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.section} aria-labelledby="datos-titulo">
            <h2 id="datos-titulo">Tus datos</h2>
            <div className={styles.fields}>
              <label className="field">
                <span>Nombre y apellido</span>
                <input required minLength={3} maxLength={120} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              {onlineEnabled ? (
                <>
                  <label className="field">
                    <span>Mail</span>
                    <input required type="email" maxLength={254} autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                    <small>Te mandamos el comprobante y los avisos del pedido.</small>
                  </label>
                  <label className="field">
                    <span>WhatsApp</span>
                    <input required type="tel" minLength={8} maxLength={30} autoComplete="tel" inputMode="tel" placeholder="3571 15 123456" value={phone} onChange={(event) => setPhone(event.target.value)} />
                  </label>
                </>
              ) : null}
            </div>
            <label className={styles.check}>
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              <span>Recordar mis datos en este dispositivo</span>
            </label>
          </section>

          {onlineEnabled ? (
            <>
              <section className={styles.section} aria-labelledby="entrega-titulo">
                <h2 id="entrega-titulo">Entrega</h2>
                <div className={styles.options} role="radiogroup" aria-labelledby="entrega-titulo">
                  {deliveryOptions.map((option) => (
                    <label key={option.kind} className={styles.option} data-checked={kind === option.kind}>
                      <input type="radio" name="entrega" value={option.kind} checked={kind === option.kind} onChange={() => setKind(option.kind)} />
                      <span className={styles.optionText}>
                        <strong>{option.title}</strong>
                        <span>{option.detail}</span>
                      </span>
                      <span className={`price ${styles.optionPrice}`}>{option.price > 0 ? formatPrice(option.price) : "Gratis"}</span>
                    </label>
                  ))}
                </div>
                {cannotShip && delivery.correo ? (
                  <p className={styles.note}>Algún producto del carrito no se envía por correo: se retira o se entrega en la zona.</p>
                ) : null}
                {kind === "local" ? (
                  <label className="field">
                    <span>Zona</span>
                    <select value={zone} onChange={(event) => setZone(event.target.value)}>
                      {delivery.localZones.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}: {formatPrice(item.price)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {kind !== "pickup" ? (
                  <div className={styles.address}>
                    <label className="field">
                      <span>Calle</span>
                      <input required autoComplete="address-line1" value={address.street} onChange={(event) => setAddress({ ...address, street: event.target.value })} />
                    </label>
                    <label className="field">
                      <span>Número</span>
                      <input required inputMode="numeric" value={address.number} onChange={(event) => setAddress({ ...address, number: event.target.value })} />
                    </label>
                    <label className="field">
                      <span>Piso o depto</span>
                      <input autoComplete="address-line2" value={address.apartment} onChange={(event) => setAddress({ ...address, apartment: event.target.value })} />
                    </label>
                    <label className="field">
                      <span>Ciudad</span>
                      <input required autoComplete="address-level2" value={address.city} onChange={(event) => setAddress({ ...address, city: event.target.value })} />
                    </label>
                    <label className="field">
                      <span>Provincia</span>
                      <input required autoComplete="address-level1" value={address.province} onChange={(event) => setAddress({ ...address, province: event.target.value })} />
                    </label>
                    <label className="field">
                      <span>Código postal</span>
                      <input required autoComplete="postal-code" pattern="[A-Za-z]?[0-9]{4}[A-Za-z]{0,3}" value={address.postal_code} onChange={(event) => setAddress({ ...address, postal_code: event.target.value })} />
                    </label>
                    <label className={`field ${styles.full}`}>
                      <span>Indicaciones para la entrega</span>
                      <input maxLength={300} value={address.notes} onChange={(event) => setAddress({ ...address, notes: event.target.value })} />
                    </label>
                  </div>
                ) : null}
              </section>

              <section className={styles.section} aria-labelledby="pago-titulo">
                <h2 id="pago-titulo">Pago</h2>
                {paymentOptions.length ? (
                  <div className={styles.options} role="radiogroup" aria-labelledby="pago-titulo">
                    {paymentOptions.map((option) => (
                      <label key={option.kind} className={styles.option} data-checked={payment === option.kind}>
                        <input type="radio" name="pago" value={option.kind} checked={payment === option.kind} onChange={() => setPayment(option.kind)} />
                        <span className={styles.optionText}>
                          <strong>{option.title}</strong>
                          <span>{option.detail}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className={styles.note}>Con esta forma de entrega todavía no hay pago online. Elegí retiro en el local.</p>
                )}
              </section>
            </>
          ) : (
            <section className={styles.section} aria-labelledby="reserva-titulo">
              <h2 id="reserva-titulo">Reserva por WhatsApp</h2>
              <p className={styles.lead}>
                Te armamos el mensaje con tu pedido. Lo mandás por WhatsApp, te confirmamos el stock y lo retirás en
                Independencia 784. Pagás en el local con efectivo, transferencia, Mercado Pago o Naranja X.
              </p>
            </section>
          )}

          <section className={styles.section} aria-labelledby="nota-titulo">
            <h2 id="nota-titulo">Nota para el local</h2>
            <label className="field">
              <span>Opcional</span>
              <textarea maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            {onlineEnabled ? (
              <label className={styles.check}>
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>Quiero recibir ofertas de CheTech por mail o WhatsApp. Podés darte de baja cuando quieras.</span>
              </label>
            ) : null}
          </section>
        </div>

        <aside className={styles.summary} aria-labelledby="resumen-titulo">
          <div className={styles.ticket}>
            <div className="carta" aria-hidden />
            <h2 id="resumen-titulo">Resumen</h2>
            <dl>
              <div>
                <dt>Productos</dt>
                <dd className="price">{formatPrice(subtotal)}</dd>
              </div>
              {onlineEnabled ? (
                <div>
                  <dt>Entrega</dt>
                  <dd className="price">{shipping > 0 ? formatPrice(shipping) : "Gratis"}</dd>
                </div>
              ) : null}
              <div className={styles.total}>
                <dt>Total</dt>
                <dd className="price">{formatPrice(onlineEnabled ? total : subtotal)}</dd>
              </div>
            </dl>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            {onlineEnabled ? (
              <button type="submit" className="btn" data-size="large" data-block="true" disabled={sending || !payment}>
                {sending ? "Creando el pedido…" : submitLabel}
              </button>
            ) : (
              <button type="submit" className="btn" data-size="large" data-block="true">
                Enviar pedido por WhatsApp
              </button>
            )}
            <p className={styles.legal}>
              Al confirmar aceptás los{" "}
              <Link href="/terminos-y-condiciones" className="enlace">
                términos y condiciones
              </Link>
              . Tenés 10 días para arrepentirte de la compra.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
