"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";
import styles from "./cart-drawer.module.css";

type Flight = { key: number; image: string; from: DOMRect; to: DOMRect };

// E6 · Agregado al carrito: la miniatura viaja al ícono, el contador sube y se abre el panel.
export function CartDrawer() {
  const { items, count, subtotal, drawerOpen, closeDrawer, lastAdded, update, remove, add } =
    useCart();
  const reduce = useReducedMotion();
  const pathname = usePathname();
  const [flight, setFlight] = useState<Flight | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeDrawer();
  }, [pathname, closeDrawer]);

  useEffect(() => {
    if (!drawerOpen) {
      setPanelVisible(false);
      return;
    }
    const recent = lastAdded && Date.now() - lastAdded.at < 700;
    const target = document.querySelector("[data-cart-target]")?.getBoundingClientRect();
    if (recent && lastAdded?.origin && lastAdded.product.image && target && !reduce) {
      setFlight({
        key: lastAdded.at,
        image: lastAdded.product.image,
        from: lastAdded.origin,
        to: target,
      });
      const timer = window.setTimeout(() => setPanelVisible(true), 420);
      return () => window.clearTimeout(timer);
    }
    setPanelVisible(true);
  }, [drawerOpen, lastAdded, reduce]);

  useEffect(() => {
    if (!panelVisible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && closeDrawer();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [panelVisible, closeDrawer]);

  const idsKey = items
    .map((item) => item.product.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (!panelVisible || !idsKey) return;
    const controller = new AbortController();
    fetch(`/api/cart/suggestions?exclude=${encodeURIComponent(idsKey)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : { products: [] }))
      .then((payload: { products: Product[] }) => setSuggestions(payload.products ?? []))
      .catch(() => undefined);
    return () => controller.abort();
  }, [panelVisible, idsKey]);

  return (
    <>
      <AnimatePresence>
        {flight ? (
          <motion.div
            key={flight.key}
            className={styles.flight}
            initial={{
              left: flight.from.left,
              top: flight.from.top,
              width: flight.from.width,
              height: flight.from.height,
              opacity: 1,
              borderRadius: 10,
            }}
            animate={{
              left: flight.to.left + flight.to.width / 2 - 14,
              top: flight.to.top + flight.to.height / 2 - 14,
              width: 28,
              height: 28,
              opacity: 0.6,
              borderRadius: 14,
            }}
            transition={{ duration: 0.45, ease: [0.65, 0, 0.35, 1] }}
            onAnimationComplete={() => setFlight(null)}
            aria-hidden
          >
            <Image src={flight.image} alt="" fill sizes="200px" />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {panelVisible ? (
          <div className={styles.root} role="presentation">
            <motion.button
              type="button"
              className={styles.scrim}
              aria-label="Cerrar carrito"
              onClick={closeDrawer}
              tabIndex={-1}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.aside
              className={styles.panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby="carrito-titulo"
              initial={reduce ? { x: 0 } : { x: "100%" }}
              animate={{ x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: "100%" }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className={styles.head}>
                <h2 id="carrito-titulo">
                  Tu carrito{" "}
                  <span className={styles.headCount}>
                    {count} {count === 1 ? "producto" : "productos"}
                  </span>
                </h2>
                <button
                  ref={closeRef}
                  type="button"
                  className={styles.close}
                  onClick={closeDrawer}
                  aria-label="Cerrar carrito"
                >
                  <X aria-hidden size={22} />
                </button>
              </div>

              {items.length === 0 ? (
                <div className={styles.empty}>
                  <p>Tu carrito está vacío.</p>
                  <Link href="/productos" className="btn" onClick={closeDrawer}>
                    Ver productos
                  </Link>
                </div>
              ) : (
                <>
                  {/* Los productos y las sugerencias se desplazan juntos; el total y los botones quedan fijos abajo. */}
                  <div className={styles.scroll}>
                    <ul className={styles.items}>
                      {items.map(({ product, quantity }) => (
                        <li
                          key={product.id}
                          className={styles.item}
                          data-new={lastAdded?.product.id === product.id || undefined}
                        >
                          <Link
                            href={`/productos/${product.slug}`}
                            className={styles.thumb}
                            onClick={closeDrawer}
                          >
                            {product.image ? (
                              <Image src={product.image} alt="" fill sizes="72px" />
                            ) : null}
                          </Link>
                          <div className={styles.itemBody}>
                            <Link
                              href={`/productos/${product.slug}`}
                              className={styles.itemName}
                              onClick={closeDrawer}
                            >
                              {product.name}
                            </Link>
                            <div className={styles.itemRow}>
                              <div
                                className={styles.stepper}
                                role="group"
                                aria-label={`Cantidad de ${product.name}`}
                              >
                                <button
                                  type="button"
                                  aria-label="Quitar una unidad"
                                  onClick={() =>
                                    quantity > 1
                                      ? update(product.id, quantity - 1)
                                      : remove(product.id)
                                  }
                                >
                                  {quantity > 1 ? (
                                    <Minus aria-hidden size={16} />
                                  ) : (
                                    <Trash2 aria-hidden size={16} />
                                  )}
                                </button>
                                <output aria-live="polite">{quantity}</output>
                                <button
                                  type="button"
                                  aria-label="Sumar una unidad"
                                  disabled={quantity >= 10}
                                  onClick={() => update(product.id, quantity + 1)}
                                >
                                  <Plus aria-hidden size={16} />
                                </button>
                              </div>
                              <span className={`price ${styles.itemPrice}`}>
                                {formatPrice(product.price * quantity)}
                              </span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>

                    {suggestions.length ? (
                      <div className={styles.suggest}>
                        <p className={styles.suggestTitle}>Sumá también</p>
                        <ul>
                          {suggestions.slice(0, 3).map((product) => (
                            <li key={product.id}>
                              <span className={styles.suggestThumb}>
                                {product.image ? (
                                  <Image src={product.image} alt="" fill sizes="48px" />
                                ) : null}
                              </span>
                              <span className={styles.suggestName}>{product.name}</span>
                              <button
                                type="button"
                                className={styles.suggestAdd}
                                onClick={() => add(product, 1, { silent: true })}
                                aria-label={`Agregar ${product.name} por ${formatPrice(product.price)}`}
                              >
                                <span className="price">{formatPrice(product.price)}</span>
                                <Plus aria-hidden size={16} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>

                  <div className={styles.foot}>
                    <div className={styles.total}>
                      <span>Subtotal</span>
                      <span className="price">{formatPrice(subtotal)}</span>
                    </div>
                    <p className={styles.note}>
                      La entrega y el pago se eligen en el próximo paso. Retirar en el local es
                      gratis.
                    </p>
                    <Link
                      href="/carrito"
                      className="btn"
                      data-size="large"
                      data-block="true"
                      onClick={closeDrawer}
                    >
                      Finalizar compra
                    </Link>
                    <button
                      type="button"
                      className="btn"
                      data-variant="quiet"
                      data-block="true"
                      onClick={closeDrawer}
                    >
                      Seguir comprando
                    </button>
                  </div>
                </>
              )}
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
