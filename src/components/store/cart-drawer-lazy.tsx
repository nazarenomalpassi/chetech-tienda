"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart-provider";

// El panel del carrito y la biblioteca que lo anima (Motion) pesan más que el resto del encabezado
// junto. No hacen falta para ver la página: se descargan cuando el navegador queda libre, o antes si
// alguien agrega un producto.
const CartDrawer = dynamic(() => import("./cart-drawer").then((mod) => mod.CartDrawer), {
  ssr: false,
});

export function CartDrawerLazy() {
  const { drawerOpen } = useCart();
  const [ready, setReady] = useState(false);
  // Si el carrito se abre antes de tiempo, se monta en ese mismo momento (y queda montado).
  if (drawerOpen && !ready) setReady(true);

  useEffect(() => {
    const load = () => setReady(true);
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(load, { timeout: 4000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(load, 2500);
    return () => window.clearTimeout(timer);
  }, []);

  return ready ? <CartDrawer /> : null;
}
