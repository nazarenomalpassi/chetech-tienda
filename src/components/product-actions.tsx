"use client";

import { MessageCircle, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/components/cart-provider";
import { productWhatsApp } from "@/lib/whatsapp";
import type { Product } from "@/lib/types";

function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(Math.trunc(value), 99));
}

export function ProductActions({ product }: { product: Product }) {
  const { add } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState<{ id: number; quantity: number } | null>(null);
  const disabled = product.status === "Sin stock";

  function addToCart() {
    const safeQuantity = clampQuantity(quantity);
    setQuantity(safeQuantity);
    add(product, safeQuantity);
    setFeedback((current) => ({ id: (current?.id ?? 0) + 1, quantity: safeQuantity }));
  }

  return (
    <div className="buy-actions">
      <label>
        Cantidad
        <input
          type="number"
          inputMode="numeric"
          step={1}
          min={1}
          max={99}
          value={quantity}
          onChange={(event) => setQuantity(clampQuantity(Number(event.target.value)))}
        />
      </label>
      <button type="button" className="button primary" disabled={disabled} onClick={addToCart}>
        <ShoppingBag /> Agregar al carrito
      </button>
      <a
        className="button whatsapp"
        href={productWhatsApp(product, Boolean(product.board))}
        target="_blank"
        rel="noreferrer"
      >
        <MessageCircle /> {product.board ? "Consultar compatibilidad" : "Consultar por WhatsApp"}
      </a>
      <p className="cart-feedback" role="status" aria-live="polite" aria-atomic="true">
        {feedback && (
          <span key={feedback.id}>
            {feedback.quantity} {feedback.quantity === 1 ? "unidad agregada" : "unidades agregadas"}{" "}
            al carrito.
          </span>
        )}
      </p>
    </div>
  );
}
