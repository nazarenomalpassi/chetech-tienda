"use client";

import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ViewTransition, useRef } from "react";
import { familyBySlug } from "@/config/catalog";
import { useCart } from "@/components/cart-provider";
import { StockStatus } from "@/components/store/stock-status";
import { formatPrice } from "@/lib/format";
import { lqip, markLoaded } from "@/lib/images";
import { trackEvent } from "@/lib/track";
import type { Product } from "@/lib/types";
import styles from "./product-card.module.css";

type Props = {
  product: Product;
  /** Posición en la grilla: escalona la entrada de los blísteres (E4). */
  index?: number;
  priority?: boolean;
  sizes?: string;
};

// Tarjeta blíster: la forma del producto colgado en la pared del local, con su ranura arriba.
export function ProductCard({ product, index = 0, priority = false, sizes }: Props) {
  const { add } = useCart();
  const imageRef = useRef<HTMLDivElement>(null);
  const signal = familyBySlug.get(product.family)?.signal ?? "gris";
  const soldOut = product.status === "Sin stock";
  const second = product.images[1];

  const addToCart = () => {
    add(product, 1, { origin: imageRef.current?.getBoundingClientRect() ?? null });
    trackEvent("add_to_cart", {
      value: product.price,
      items: [{ id: product.id, name: product.name, price: product.price, family: product.familyName }],
    });
  };

  return (
    <article
      className={styles.card}
      data-signal={signal}
      style={{ "--i": index % 4 } as React.CSSProperties}
    >
      <div className={styles.header} aria-hidden>
        <span className={styles.slot} />
      </div>
      <Link href={`/productos/${product.slug}`} className={styles.media} aria-label={product.name}>
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
            aria-label={`Agregar ${product.name} al carrito`}
          >
            <Plus aria-hidden size={18} />
            <span>Agregar</span>
          </button>
        </div>
      </div>
    </article>
  );
}
