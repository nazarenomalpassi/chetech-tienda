"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { ViewTransition, useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { StockStatus } from "@/components/store/stock-status";
import { formatPrice } from "@/lib/format";
import { lqip, markLoaded } from "@/lib/images";
import { clearPointerVars, writePointerVars } from "@/lib/pointer-vars";
import { trackEvent } from "@/lib/track";
import type { Product } from "@/lib/types";
import styles from "./product-card.module.css";

type Props = {
  product: Product;
  /** Posición en la grilla: escalona la entrada de los blísteres (E4). */
  index?: number;
  priority?: boolean;
  sizes?: string;
  /** "cascada": entra apenas carga, una tras otra (lo que ya está en pantalla). "scroll": entra al scrollear. */
  entrance?: "cascada" | "scroll";
};

// Tarjeta blíster: la forma del producto colgado en la pared del local, con su ranura arriba.
export function ProductCard({ product, index = 0, priority = false, sizes, entrance = "scroll" }: Props) {
  const { add } = useCart();
  const imageRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [added, setAdded] = useState(false);
  const soldOut = product.status === "Sin stock";
  const second = product.images[1];

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      if (addedTimer.current) clearTimeout(addedTimer.current);
    },
    [],
  );

  const addToCart = () => {
    add(product, 1, { origin: imageRef.current?.getBoundingClientRect() ?? null });
    // El botón confirma con una tilde un momento y vuelve al "+".
    setAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAdded(false), 1400);
    trackEvent("add_to_cart", {
      value: product.price,
      items: [{ id: product.id, name: product.name, price: product.price, family: product.familyName }],
    });
  };

  return (
    <article
      className={styles.card}
      data-entrance={entrance}
      style={{ "--i": index % 4, "--n": index } as React.CSSProperties}
    >
      <Link
        href={`/productos/${product.slug}`}
        className={styles.media}
        aria-label={product.name}
        onPointerMove={(event) => writePointerVars(event, imageRef.current, frame)}
        onPointerLeave={() => clearPointerVars(imageRef.current, frame)}
      >
        <ViewTransition name={`producto-${product.slug}`} share="morph">
          <div
            className={styles.bubble}
            ref={imageRef}
            style={product.image ? ({ "--lqip": lqip(product.image) } as React.CSSProperties) : undefined}
          >
            {product.image ? (
              <Image
                src={product.image}
                alt=""
                fill
                priority={priority}
                sizes={sizes ?? "(min-width: 1100px) 260px, (min-width: 700px) 30vw, 45vw"}
                className={styles.image}
                onLoad={markLoaded}
              />
            ) : null}
            {second ? (
              <Image src={second} alt="" fill sizes="260px" className={styles.second} loading="lazy" />
            ) : null}
            <span className={styles.sweep} aria-hidden />
            <span className={styles.scan} aria-hidden />
          </div>
        </ViewTransition>
        {product.isOffer && product.previousPrice ? <span className={styles.sticker}>Oferta</span> : null}
        {product.condition !== "Nuevo" ? <span className={styles.condition}>{product.condition}</span> : null}
      </Link>
      <div className={styles.body}>
        <h3 className={styles.name}>
          <Link href={`/productos/${product.slug}`}>{product.name}</Link>
        </h3>
        <div className={styles.priceRow}>
          <span className={`price ${styles.price}`}>{formatPrice(product.price)}</span>
          {product.previousPrice ? <s className={styles.before}>{formatPrice(product.previousPrice)}</s> : null}
        </div>
        <div className={styles.foot}>
          <StockStatus status={product.status} compact />
          <button
            type="button"
            className={styles.add}
            onClick={addToCart}
            disabled={soldOut}
            data-added={added}
            aria-label={`Agregar ${product.name} al carrito`}
          >
            {added ? <Check aria-hidden size={18} /> : <Plus aria-hidden size={18} />}
            <span>{added ? "Listo" : "Agregar"}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
