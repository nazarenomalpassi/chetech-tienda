"use client";

import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { formatPrice } from "@/lib/format";
import { trackEvent } from "@/lib/track";
import type { Product } from "@/lib/types";
import styles from "./buy-box.module.css";

type Props = { product: Product; whatsappHref: string };

export function BuyBox({ product, whatsappHref }: Props) {
  const router = useRouter();
  const { add } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [barVisible, setBarVisible] = useState(false);
  const [added, setAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [direction, setDirection] = useState<"sube" | "baja">("sube");
  const actionsRef = useRef<HTMLDivElement>(null);
  const soldOut = product.status === "Sin stock";
  const item = {
    id: product.id,
    name: product.name,
    price: product.price,
    family: product.familyName,
  };

  useEffect(() => {
    trackEvent("view_item", { value: product.price, items: [item] });
    // Una sola vez por ficha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  // E7 · Barra de compra: aparece abajo cuando el botón principal sale de la pantalla (celular).
  useEffect(() => {
    const target = actionsRef.current;
    if (!target || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => setBarVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const origin = () =>
    document.querySelector<HTMLElement>("[data-product-stage]")?.getBoundingClientRect() ?? null;

  useEffect(() => () => void (addedTimer.current && clearTimeout(addedTimer.current)), []);

  // El número de cantidad entra desde abajo al sumar y desde arriba al restar.
  const step = (change: 1 | -1) => {
    setDirection(change > 0 ? "sube" : "baja");
    setQuantity((value) => Math.max(1, Math.min(10, value + change)));
  };

  const addToCart = () => {
    add(product, quantity, { origin: origin() });
    setAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAdded(false), 1600);
    trackEvent("add_to_cart", { value: product.price * quantity, items: [{ ...item, quantity }] });
  };

  const buyNow = () => {
    add(product, quantity, { silent: true });
    trackEvent("add_to_cart", { value: product.price * quantity, items: [{ ...item, quantity }] });
    router.push("/carrito");
  };

  return (
    <>
      <div className={styles.box} ref={actionsRef}>
        {soldOut ? null : (
          <div className={styles.quantity}>
            <span id="cantidad-label">Cantidad</span>
            <div className={styles.stepper} role="group" aria-labelledby="cantidad-label">
              <button
                type="button"
                aria-label="Restar una"
                disabled={quantity <= 1}
                onClick={() => step(-1)}
              >
                <Minus aria-hidden size={18} />
              </button>
              <output aria-live="polite">
                <span key={quantity} data-direction={direction}>
                  {quantity}
                </span>
              </output>
              <button
                type="button"
                aria-label="Sumar una"
                disabled={quantity >= 10}
                onClick={() => step(1)}
              >
                <Plus aria-hidden size={18} />
              </button>
            </div>
          </div>
        )}
        <div className={styles.buttons}>
          <button
            type="button"
            className={`btn ${styles.addButton}`}
            data-size="large"
            data-block="true"
            data-added={added}
            onClick={addToCart}
            disabled={soldOut}
          >
            <span key={added ? "listo" : "agregar"} className={styles.addLabel}>
              {soldOut ? "Sin stock" : added ? "Agregado al carrito" : "Agregar al carrito"}
            </span>
          </button>
          {soldOut ? null : (
            <button
              type="button"
              className="btn"
              data-variant="secondary"
              data-size="large"
              data-block="true"
              onClick={buyNow}
            >
              Comprar ahora
            </button>
          )}
          <a
            className="btn"
            data-variant="whatsapp"
            data-block="true"
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2Z" />
            </svg>
            Consultar por WhatsApp
          </a>
        </div>
      </div>

      <div className={styles.bar} data-visible={barVisible && !soldOut} aria-hidden={!barVisible}>
        <div className={styles.barText}>
          <span className={styles.barName}>{product.name}</span>
          <span className={`price ${styles.barPrice}`}>
            {formatPrice(product.price * quantity)}
          </span>
        </div>
        <button type="button" className="btn" onClick={addToCart} tabIndex={barVisible ? 0 : -1}>
          Agregar<span className={styles.barLong}> al carrito</span>
        </button>
      </div>
    </>
  );
}
