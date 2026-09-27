import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CartLine } from '../types/chocolate';
import { mergeCarts } from '../../api/cart';

// M11 server cart: localStorage stays as the offline cache/fallback and the
// guest (logged-out) flow is untouched — no network happens until the app
// binds a user via loadFromServer()/syncToServer() (call loadFromServer with
// AuthContext's user.id after login, unlinkServer() on logout).
// Merge policy: SERVER WINS on conflict (see mergeCarts in api/cart.ts); the
// debounced auto-push sends the full lines array with PUT (replace semantics).
const KEY = 'chocolates.cart.v1';
const SYNC_DEBOUNCE_MS = 800;

interface CartValue {
  lines: CartLine[];
  count: number;
  warning: string | null;
  isSyncing: boolean;
  add: (sku: string, stock: number) => void;
  remove: (sku: string) => void;
  setQty: (sku: string, qty: number, stock: number) => void;
  clear: () => void;
  loadFromServer: (userId: string) => Promise<void>;
  syncToServer: (userId: string) => Promise<void>;
  unlinkServer: () => void;
}
const CartContext = createContext<CartValue | null>(null);

function readStored(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    return Array.isArray(parsed) ? parsed.filter((l) => l.qty > 0) : [];
  } catch { return [] }
}

function readServerLines(data: unknown): CartLine[] | null {
  if (typeof data !== 'object' || data === null) return null;
  const lines = (data as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) return null;
  return lines.filter(
    (l): l is CartLine =>
      typeof l === 'object' &&
      l !== null &&
      typeof (l as CartLine).sku === 'string' &&
      Number.isInteger((l as CartLine).qty) &&
      (l as CartLine).qty > 0,
  );
}

/** PUT the snapshot; null = server unavailable/offline (keep local, stay silent). */
async function putCart(userId: string, snapshot: CartLine[]): Promise<{ lines: CartLine[]; warnings: string[] } | null> {
  const res = await fetch('/api/cart', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, lines: snapshot }),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { lines?: unknown; warnings?: unknown } | null;
  const lines = readServerLines(data);
  if (lines === null) return null;
  const warnings =
    data !== null && Array.isArray(data.warnings)
      ? (data.warnings as unknown[]).filter((w): w is string => typeof w === 'string')
      : [];
  return { lines, warnings };
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lines, setLines] = useState<CartLine[]>(readStored);
  const [warning, setWarning] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const linesRef = useRef<CartLine[]>(lines);
  const serverUserRef = useRef<string | null>(null);
  const lastPushedRef = useRef<string>('');

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  useEffect(() => {
    try { window.localStorage.setItem(KEY, JSON.stringify(lines)) } catch { /* almacenamiento no disponible */ }
  }, [lines]);

  // Debounced auto-push: after login is bound, every local change is PUT
  // (replace). Skips when lines already match the last pushed/loaded payload,
  // so applying the server's clamped response never loops.
  useEffect(() => {
    const userId = serverUserRef.current;
    if (userId === null) return; // guest: localStorage only, no network
    const payload = JSON.stringify(lines);
    if (payload === lastPushedRef.current) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await putCart(userId, linesRef.current);
          if (result === null) return;
          lastPushedRef.current = JSON.stringify(result.lines);
          if (JSON.stringify(result.lines) !== JSON.stringify(linesRef.current)) setLines(result.lines);
          if (result.warnings.length > 0) setWarning(result.warnings.join('; '));
        } catch { /* sin conexión: se conserva el carrito local */ }
      })();
    }, SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [lines]);

  const loadFromServer = useCallback(async (userId: string): Promise<void> => {
    const id = userId.trim();
    if (id === '') return;
    serverUserRef.current = id;
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/cart?userId=${encodeURIComponent(id)}`);
      if (!res.ok) return; // 503 pre-004 / offline: keep the local cache, merge nothing
      const server = readServerLines(await res.json().catch(() => null));
      if (server === null) return;
      const merged = mergeCarts(server, linesRef.current);
      lastPushedRef.current = JSON.stringify(merged);
      setLines(merged);
    } catch { /* sin conexión: se conserva el carrito local */ }
    finally { setIsSyncing(false); }
  }, []);

  const syncToServer = useCallback(async (userId: string): Promise<void> => {
    const id = userId.trim();
    if (id === '') return;
    serverUserRef.current = id;
    setIsSyncing(true);
    try {
      const result = await putCart(id, linesRef.current);
      if (result === null) return;
      lastPushedRef.current = JSON.stringify(result.lines);
      setLines(result.lines);
      setWarning(result.warnings.length > 0 ? result.warnings.join('; ') : null);
    } catch { /* sin conexión: se conserva el carrito local */ }
    finally { setIsSyncing(false); }
  }, []);

  const unlinkServer = useCallback((): void => {
    serverUserRef.current = null; // logout: back to guest flow, local cart kept
  }, []);

  const value = useMemo<CartValue>(() => ({
    lines,
    count: lines.reduce((n, l) => n + l.qty, 0),
    warning,
    isSyncing,
    add: (sku, stock) => {
      if (stock <= 0) { setWarning('Sin stock'); return }
      setWarning(null);
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
      else setWarning(null);
      setLines((prev) => prev.map((l) => (l.sku === sku ? { ...l, qty: next } : l)));
    },
    clear: () => setLines([]),
    loadFromServer,
    syncToServer,
    unlinkServer,
  }), [lines, warning, isSyncing, loadFromServer, syncToServer, unlinkServer]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (ctx === null) throw new Error('useCart debe usarse dentro de CartProvider');
  return ctx;
}
