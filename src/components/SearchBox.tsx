import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { searchCatalog } from '../lib/catalog';
import type { CatalogEntry } from '../data/factories';

interface Props {
  onPick: (entry: CatalogEntry) => void;
  /** Mobile expandable: auto-focus the input when the expanded slot mounts. */
  autoFocus?: boolean;
  /**
   * Mobile expandable: collapse back to the icon button (brand returns).
   * Called ONLY on result pick, Escape, or phase change — never on
   * blur/empty/clear (single-X spec keeps the query preserved otherwise).
   */
  onClose?: () => void;
}

// M10 catalog search box (adapted stack). Debounced live search via /api/search
// with local fallback (see src/lib/catalog.ts). Picking a result navigates to
// that product's factory chamber (parent handler). Rollback: remove usages.
export const SearchBox: React.FC<Props> = ({ onPick, autoFocus = false, onClose }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CatalogEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (q.trim() === '') {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++reqId.current;
    const t = window.setTimeout(() => {
      void searchCatalog(q).then(({ entries }) => {
        if (id !== reqId.current) return;
        setResults(entries.slice(0, 8));
        setOpen(true);
        setLoading(false);
      });
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Click/tap outside closes ONLY the results dropdown — the input slot and
  // the typed query stay open (single-X spec: blur/empty never collapses).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, []);

  const pick = (entry: CatalogEntry) => {
    setQ('');
    setResults([]);
    setOpen(false);
    onPick(entry);
    // Close on selection: collapse mobile back to brand + icon button.
    onClose?.();
  };

  // THE single X: clears typed text only — never collapses the search slot.
  const clear = () => {
    setQ('');
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  const showEmpty = open && !loading && q.trim() !== '' && results.length === 0;

  return (
    <div ref={boxRef} className="relative w-full min-w-0">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8a7265] pointer-events-none" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); onClose?.(); } }}
        type="text"
        autoComplete="off"
        enterKeyHint="search"
        aria-label="Buscar chocolates"
        placeholder="Buscar…"
        className="w-full min-w-0 min-h-[32px] rounded-lg bg-[#faf6ef]/80 dark:bg-[#120a06]/80 border border-[#d4af37]/25 pl-8 pr-8 py-1.5 text-xs text-[#2b1a12] dark:text-[#fcf8f2] placeholder:text-[#8a7265] placeholder:truncate focus:outline-none focus:border-[#d4af37]/60 [appearance:textfield] [&::-webkit-search-cancel-button]:hidden"
      />
      {q !== '' && (
        <button
          type="button"
          onClick={clear}
          aria-label="Limpiar búsqueda"
          title="Limpiar búsqueda"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-[#8a7265] hover:text-[#2b1a12] hover:dark:text-[#fcf8f2] hover:bg-[#efe0c6] hover:dark:bg-[#2e1910] transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
      {open && (results.length > 0 || showEmpty) && (
        <ul
          role="listbox"
          aria-label="Resultados de búsqueda"
          className="absolute left-0 right-0 min-w-[180px] sm:min-w-0 mt-1.5 rounded-xl bg-[#fffdf8]/95 dark:bg-[#1c100a]/95 border border-[#d4af37]/30 shadow-2xl shadow-black/70 backdrop-blur-xl overflow-hidden z-50"
        >
          {results.map((entry) => (
            <li key={entry.sku} role="option" aria-selected="false">
              <button
                onClick={() => pick(entry)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#efe0c6] hover:dark:bg-[#2e1910] transition-colors cursor-pointer"
              >
                <span className="text-xs font-bold text-[#2b1a12] dark:text-[#fcf8f2] truncate">{entry.nameEs}</span>
                <span className="text-[11px] font-extrabold text-[#8a6216] dark:text-[#f1c40f] shrink-0">
                  Bs {entry.priceBOB.toFixed(2)}
                </span>
              </button>
            </li>
          ))}
          {showEmpty && (
            <li className="px-3 py-2.5 text-[11px] text-[#8a7265]">
              Sin resultados para “{q.trim()}”
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
