"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ShoppingBag } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";

type ProductCardProps = {
  product: Product;
  priority?: boolean;
  revealIndex?: number;
  sizes?: string;
};

export function ProductCard({
  product,
  priority = false,
  revealIndex = 0,
  sizes = "(max-width: 390px) calc(100vw - 28px), (max-width: 900px) calc(50vw - 22px), (max-width: 1279px) 33vw, 25vw",
}: ProductCardProps) {
  const { add } = useCart();
  const [imageFailed, setImageFailed] = useState(false);
  const detailHref = `/productos/${product.slug}`;
  const isOutOfStock = product.status === "Sin stock";
  const revealStyle = {
    "--reveal-delay": `${Math.min(Math.max(revealIndex, 0), 8) * 45}ms`,
  } as CSSProperties;

  return (
    <article className="product-card" data-reveal style={revealStyle}>
      <Link
        href={detailHref}
        className="product-card-link"
        aria-label={`Ver detalle de ${product.name}`}
      />
      <div className="product-media">
        {product.image && !imageFailed ? (
          <Image
            src={product.image}
            fill
            sizes={sizes}
            alt={product.name}
            priority={priority}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="product-placeholder" aria-hidden="true">
            <span>CHETECH</span>
          </div>
        )}
        <div className="product-labels">
          {product.isOffer && <span>Oferta</span>}
          {product.isNewArrival && <span>Nuevo ingreso</span>}
        </div>
      </div>
      <div className="product-content">
        <p className="eyebrow">
          {product.category}
          {product.condition !== "Nuevo" ? ` · ${product.condition}` : ""}
        </p>
        <h3>{product.name}</h3>
        <div className="price-row">
          <strong>{formatPrice(product.price)}</strong>
          <span className={`status ${isOutOfStock ? "off" : ""}`}>{product.status}</span>
        </div>
        <div className="product-actions">
          <span className="text-link product-detail-cta" aria-hidden="true">
            Ver detalle <ArrowUpRight />
          </span>
          <button
            type="button"
            onClick={() => add(product)}
            disabled={isOutOfStock}
            aria-label={`Agregar ${product.name} al carrito`}
          >
            <ShoppingBag />
          </button>
        </div>
      </div>
    </article>
  );
}
