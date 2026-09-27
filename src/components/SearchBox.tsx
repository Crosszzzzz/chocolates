import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { searchCatalog } from '../lib/catalog';
import type { CatalogEntry } from '../data/factories';

interface Props {
  onPick: (entry: CatalogEntry) => void;
}

// M10 catalog search box (adapted stack). Debounced live search via /api/search
// with local fallback (see src/lib/catalog.ts). Picking a result navigates to
// that product's factory chamber (parent handler). Rollback: remove usages.
export const SearchBox: React.FC<Props> = ({ onPick }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CatalogEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
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
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, []);

  const pick = (entry: CatalogEntry) => {
    setQ('');
    setResults([]);
    setOpen(false);
    onPick(entry);
  };

  const showEmpty = open && !loading && q.trim() !== '' && results.length === 0;

  return (
    <div ref={boxRef} className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8a7265] pointer-events-none" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        type="search"
        aria-label="Buscar chocolates"
        placeholder="Buscar chocolate…"
        className="w-full min-h-[32px] rounded-lg bg-[#120a06]/80 border border-[#d4af37]/25 pl-8 pr-2.5 py-1.5 text-xs text-[#fcf8f2] placeholder:text-[#8a7265] focus:outline-none focus:border-[#d4af37]/60"
      />
      {open && (results.length > 0 || showEmpty) && (
        <ul
          role="listbox"
          aria-label="Resultados de búsqueda"
          className="absolute left-0 right-0 mt-1.5 rounded-xl bg-[#1c100a]/95 border border-[#d4af37]/30 shadow-2xl shadow-black/70 backdrop-blur-xl overflow-hidden z-50"
        >
          {results.map((entry) => (
            <li key={entry.sku} role="option" aria-selected="false">
              <button
                onClick={() => pick(entry)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#2e1910] transition-colors cursor-pointer"
              >
                <span className="text-xs font-bold text-[#fcf8f2] truncate">{entry.nameEs}</span>
                <span className="text-[11px] font-extrabold text-[#f1c40f] shrink-0">
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
