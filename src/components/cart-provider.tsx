"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAccountSummary } from "@/components/account-provider";
import type { CartItem, Product } from "@/lib/types";

export type AddOptions = {
  /** Rectángulo de la foto que se tocó: la miniatura vuela desde ahí al carrito (efecto E6). */
  origin?: DOMRect | null;
  /** No abrir el panel del carrito (por ejemplo, en "Comprar ahora", que va directo a pagar). */
  silent?: boolean;
};

export type LastAdded = { product: Product; quantity: number; at: number; origin: DOMRect | null };

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  lastAdded: LastAdded | null;
  add: (product: Product, quantity?: number, options?: AddOptions) => void;
  update: (id: string, quantity: number) => void;
  remove: (id: string) => void;
  clear: () => void;
};

type CartScope = "unresolved" | "anonymous" | string;

const CartContext = createContext<CartContextValue | null>(null);
const LEGACY_CART_KEY = "chetech-storefront-cart-v2";
const ANONYMOUS_CART_KEY = "chetech-storefront-cart-v3:anonymous";
const PENDING_CART_PREFIX = "chetech-storefront-cart-v3:pending:";
const EMPTY_CART: CartItem[] = [];

// En la compra online el máximo por producto es 10 (la base aplica el mismo límite).
function clampQuantity(value: number) {
  return Math.max(1, Math.min(Math.trunc(Number(value) || 1), 10));
}

function cartFingerprint(items: CartItem[]) {
  return JSON.stringify(items.map((item) => [item.product.id, item.quantity]));
}

function parseStoredCart(value: string | null): CartItem[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed
      .flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Partial<CartItem>;
        const product = row.product;
        if (
          !product ||
          typeof product.id !== "string" ||
          typeof product.slug !== "string" ||
          typeof product.name !== "string" ||
          typeof product.sku !== "string" ||
          !Number.isFinite(product.price) ||
          product.price <= 0
        )
          return [];

        return [{ product, quantity: clampQuantity(Number(row.quantity)) } as CartItem];
      })
      .slice(0, 25);
  } catch {
    return [];
  }
}

function mergeLocalCarts(...carts: CartItem[][]) {
  const merged = new Map<string, CartItem>();
  for (const cart of carts) {
    for (const item of cart) {
      const current = merged.get(item.product.id);
      if (current) {
        current.quantity = Math.max(current.quantity, clampQuantity(item.quantity));
      } else if (merged.size < 25) {
        merged.set(item.product.id, {
          product: item.product,
          quantity: clampQuantity(item.quantity),
        });
      }
    }
  }
  return [...merged.values()];
}

function pendingCartKey(accountId: string) {
  return `${PENDING_CART_PREFIX}${accountId}`;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { account, loading: accountLoading } = useAccountSummary();
  const accountId = account?.accountStatus === "active" ? account.id : undefined;
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [activeScope, setActiveScope] = useState<CartScope>("unresolved");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<LastAdded | null>(null);
  const scope = useRef<CartScope>("unresolved");
  const anonymousItems = useRef<CartItem[]>([]);
  const currentItems = useRef<CartItem[]>([]);
  const lastSyncedCart = useRef("");
  currentItems.current = items;

  useEffect(() => {
    // v2 mixed anonymous and authenticated carts in one key. It cannot be
    // migrated safely because its owner is unknown, so discard it once.
    localStorage.removeItem(LEGACY_CART_KEY);
    const storedAnonymous = parseStoredCart(localStorage.getItem(ANONYMOUS_CART_KEY));
    anonymousItems.current = storedAnonymous;
    setItems(storedAnonymous);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || accountLoading) return;

    const nextScope: CartScope = accountId ?? "anonymous";
    if (scope.current === nextScope) return;

    const previousScope = scope.current;
    scope.current = nextScope;
    setActiveScope(nextScope);
    setServerReady(false);
    lastSyncedCart.current = "";

    if (!accountId) {
      setItems(anonymousItems.current);
      return;
    }

    const pendingKey = pendingCartKey(accountId);
    const storedPending = parseStoredCart(localStorage.getItem(pendingKey));
    const canClaimAnonymousCart = previousScope === "unresolved" || previousScope === "anonymous";
    const pendingItems = mergeLocalCarts(
      storedPending,
      canClaimAnonymousCart ? currentItems.current : [],
    );

    // Reserve the anonymous cart for this identity before starting the
    // request. If it fails, only this same account can retry the merge.
    if (canClaimAnonymousCart) {
      anonymousItems.current = [];
      localStorage.removeItem(ANONYMOUS_CART_KEY);
    }
    if (pendingItems.length) localStorage.setItem(pendingKey, JSON.stringify(pendingItems));
    else localStorage.removeItem(pendingKey);

    setItems([]);
    const controller = new AbortController();
    fetch("/api/cart", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "merge",
        items: pendingItems.map((item) => ({ id: item.product.id, quantity: item.quantity })),
      }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload: { items?: CartItem[] }) => {
        if (scope.current !== accountId || !Array.isArray(payload.items)) return;
        const canonicalItems = payload.items.slice(0, 25);
        localStorage.removeItem(pendingKey);
        lastSyncedCart.current = cartFingerprint(canonicalItems);
        // A product can be added while the canonical cart is loading. Keep
        // that new local intent and let the replace sync below persist it.
        setItems((current) => mergeLocalCarts(canonicalItems, current));
        setServerReady(true);
      })
      .catch(() => {
        if (!controller.signal.aborted && scope.current === accountId) {
          // Keep the account-scoped pending cart visible and available for a
          // safe retry after a transient network failure.
          setItems(pendingItems);
        }
      });

    return () => controller.abort();
  }, [accountId, accountLoading, hydrated]);

  useEffect(() => {
    if (
      !hydrated ||
      scope.current !== activeScope ||
      (activeScope !== "unresolved" && activeScope !== "anonymous")
    )
      return;
    anonymousItems.current = items;
    if (items.length) localStorage.setItem(ANONYMOUS_CART_KEY, JSON.stringify(items));
    else localStorage.removeItem(ANONYMOUS_CART_KEY);
  }, [activeScope, hydrated, items]);

  useEffect(() => {
    if (!accountId || !serverReady || scope.current !== accountId) return;
    const fingerprint = cartFingerprint(items);
    if (fingerprint === lastSyncedCart.current) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      fetch("/api/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "replace",
          items: items.map((item) => ({ id: item.product.id, quantity: item.quantity })),
        }),
        signal: controller.signal,
      })
        .then((response) => {
          if (response.ok && scope.current === accountId) lastSyncedCart.current = fingerprint;
        })
        .catch(() => undefined);
    }, 650);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [accountId, items, serverReady]);

  const add = useCallback(
    (product: Product, quantity = 1, options?: AddOptions) => {
      setLastAdded({
        product,
        quantity: clampQuantity(quantity),
        at: Date.now(),
        origin: options?.origin ?? null,
      });
      if (!options?.silent) setDrawerOpen(true);
      setItems((current) => {
        const safeQuantity = clampQuantity(quantity);
        const existing = current.find((item) => item.product.id === product.id);
        return existing
          ? current.map((item) =>
              item.product.id === product.id
                ? { ...item, quantity: clampQuantity(item.quantity + safeQuantity) }
                : item,
            )
          : current.length >= 25
            ? current
            : [...current, { product, quantity: safeQuantity }];
      });
    },
    [],
  );
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const update = useCallback(
    (id: string, quantity: number) =>
      setItems((current) =>
        current.map((item) =>
          item.product.id === id ? { ...item, quantity: clampQuantity(quantity) } : item,
        ),
      ),
    [],
  );
  const remove = useCallback(
    (id: string) => setItems((current) => current.filter((item) => item.product.id !== id)),
    [],
  );
  const clear = useCallback(() => setItems([]), []);
  const expectedScope: CartScope = accountId ?? "anonymous";
  const visibleItems =
    hydrated && !accountLoading && activeScope === expectedScope ? items : EMPTY_CART;
  const value = useMemo(
    () => ({
      items: visibleItems,
      count: visibleItems.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: visibleItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
      drawerOpen,
      openDrawer,
      closeDrawer,
      lastAdded,
      add,
      update,
      remove,
      clear,
    }),
    [visibleItems, drawerOpen, openDrawer, closeDrawer, lastAdded, add, update, remove, clear],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}
