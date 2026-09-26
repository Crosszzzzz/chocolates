import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { CartLine } from '../types/chocolate';
const KEY = 'chocolates.cart.v1';
interface CartValue { lines: CartLine[]; count: number; warning: string | null; add: (sku: string, stock: number) => void; remove: (sku: string) => void; setQty: (sku: string, qty: number, stock: number) => void; clear: () => void }
const CartContext = createContext<CartValue | null>(null);
function readStored(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    return Array.isArray(parsed) ? parsed.filter((l) => l.qty > 0) : [];
  } catch { return [] }
}
export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lines, setLines] = useState<CartLine[]>(readStored);
  const [warning, setWarning] = useState<string | null>(null);
  useEffect(() => {
    try { window.localStorage.setItem(KEY, JSON.stringify(lines)) } catch { /* almacenamiento no disponible */ }
  }, [lines]);
  const value = useMemo<CartValue>(() => ({
    lines,
    count: lines.reduce((n, l) => n + l.qty, 0),
    warning,
    add: (sku, stock) => {
      if (stock <= 0) { setWarning('Sin stock'); return }
      setLines((prev) => {
        const found = prev.find((l) => l.sku === sku);
        if (!found) return [...prev, { sku, qty: 1 }];
        if (found.qty >= stock) { setWarning(`Solo quedan ${stock} unidades`); return prev }
        return prev.map((l) => (l.sku === sku ? { ...l, qty: l.qty + 1 } : l));
      });
    },
    remove: (sku) => setLines((prev) => prev.filter((l) => l.sku !== sku)),
    setQty: (sku, qty, stock) => {
      const next = Math.max(1, Math.min(qty, Math.max(stock, 1)));
      if (qty > stock) setWarning(`Solo quedan ${stock} unidades`);
      setLines((prev) => prev.map((l) => (l.sku === sku ? { ...l, qty: next } : l)));
    },
    clear: () => setLines([]),
  }), [lines, warning]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (ctx === null) throw new Error('useCart debe usarse dentro de CartProvider');
  return ctx;
}
