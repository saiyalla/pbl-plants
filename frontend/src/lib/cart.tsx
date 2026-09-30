"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Product } from "./api";

export type CartLine = {
  productId: number;
  name: string;
  icon: string;
  pricePaise: number;
  quantity: number;
};

type CartContextValue = {
  lines: CartLine[];
  count: number;
  subtotalPaise: number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  add: (product: Product) => void;
  setQuantity: (productId: number, quantity: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
};

const STORAGE_KEY = "pbl-cart-v1";
const MAX_QTY = 20;
const CartContext = createContext<CartContextValue | null>(null);

function load(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [isOpen, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Read the saved cart after mount (localStorage isn't available during server render).
  useEffect(() => {
    setLines(load());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* private mode / storage full — cart still works for this visit */
    }
  }, [lines, loaded]);

  const add = useCallback((p: Product) => {
    if (p.price_paise == null) return;
    const price = p.price_paise;
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === p.id ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + 1), pricePaise: price } : l,
        );
      }
      return [...prev, { productId: p.id, name: p.name, icon: p.icon, pricePaise: price, quantity: 1 }];
    });
    setOpen(true);
  }, []);

  const setQuantity = useCallback((productId: number, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.productId !== productId)
        : prev.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(MAX_QTY, quantity) } : l)),
    );
  }, []);

  const remove = useCallback((productId: number) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      subtotalPaise: lines.reduce((n, l) => n + l.quantity * l.pricePaise, 0),
      isOpen,
      open: () => setOpen(true),
      close: () => setOpen(false),
      add,
      setQuantity,
      remove,
      clear: () => setLines([]),
    }),
    [lines, isOpen, add, setQuantity, remove],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
