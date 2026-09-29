import React, { useEffect, useRef, useState } from 'react';
import { Clock, Factory, LocateFixed, MapPin, Navigation, Phone, Store, X } from 'lucide-react';
import { getBrandLocations, type BrandLocation } from '../data/brandLocations';
import { buildMapsDirUrl, buildMapsSearchUrl, distanceKm } from '../lib/maps';

interface SucursalesModalProps {
  open: boolean;
  onClose: () => void;
  factoryId?: string;
  factoryName?: string;
}

type GeoStatus = 'idle' | 'loading' | 'ready' | 'error';

// Spanish user-facing message per GeolocationPositionError code.
function geoErrorMessage(code: number): string {
  if (code === 1) return 'Permiso de ubicación denegado. Te mostramos todas las sucursales para que elijas.';
  if (code === 2) return 'No pudimos obtener tu ubicación. Te mostramos todas las sucursales para que elijas.';
  return 'La ubicación tardó demasiado. Te mostramos todas las sucursales para que elijas.';
}

function branchSearchQuery(branch: BrandLocation): string {
  return `${branch.name}, ${branch.address}`;
}

// Directions destination for a branch; avoids duplicating ", Sucre" since
// stored addresses already include the city.
function branchDirDestination(branch: BrandLocation): string {
  return branch.address.includes('Sucre') ? branch.address : `${branch.address}, Sucre`;
}

function findNearestBranch(lat: number, lng: number, branches: BrandLocation[]): BrandLocation | null {
  let nearest: BrandLocation | null = null;
  let best = Infinity;
  for (const branch of branches) {
    if (branch.lat === undefined || branch.lng === undefined) continue;
    const d = distanceKm({ lat, lng }, { lat: branch.lat, lng: branch.lng });
    if (d < best) {
      best = d;
      nearest = branch;
    }
  }
  return nearest;
}

export const SucursalesModal: React.FC<SucursalesModalProps> = ({ open, onClose, factoryId, factoryName }) => {
  const { branches: BRANCHES, factory: FACTORY, nearestQuery: NEAREST_SEARCH_QUERY, factoryQuery: FACTORY_DIR_QUERY, showFactoryVisit: SHOW_FACTORY_VISIT = true } =
    getBrandLocations(factoryId);
  const title = factoryName !== undefined && factoryName !== '' ? `${factoryName} — ${SHOW_FACTORY_VISIT ? 'Sucursales y Fábrica' : 'Sucursales'}` : (SHOW_FACTORY_VISIT ? 'Sucursales y Fábrica' : 'Sucursales');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [userCoords, setUserCoords] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [nearestLabel, setNearestLabel] = useState<string | null>(null);

  // Escape to close + initial focus + basic focus trap (grafted from ProductDetailDrawer).
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function requestNearestRoute(): void {
    // No geolocation support: fall back to a generic search so Google picks nearest.
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus('error');
      setGeoMessage('Tu dispositivo no soporta geolocalización. Te mostramos todas las sucursales para que elijas.');
      window.open(buildMapsSearchUrl(NEAREST_SEARCH_QUERY), '_blank', 'noopener,noreferrer');
      return;
    }
    setGeoStatus('loading');
    setGeoMessage(null);
    setNearestLabel(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const origin = `${pos.coords.latitude},${pos.coords.longitude}`;
        setUserCoords(origin);
        const nearest = findNearestBranch(pos.coords.latitude, pos.coords.longitude, BRANCHES);
        // Defensive: if no branch has coordinates yet, fall back to generic search.
        if (nearest === null) {
          setGeoStatus('ready');
          window.open(buildMapsDirUrl(NEAREST_SEARCH_QUERY, origin), '_blank', 'noopener,noreferrer');
          return;
        }
        setGeoStatus('ready');
        setNearestLabel(`${nearest.name} (${nearest.address})`);
        window.open(buildMapsDirUrl(branchDirDestination(nearest), origin), '_blank', 'noopener,noreferrer');
      },
      (err) => {
        setGeoStatus('error');
        setGeoMessage(geoErrorMessage(err.code));
        window.open(buildMapsSearchUrl(NEAREST_SEARCH_QUERY), '_blank', 'noopener,noreferrer');
      },
      { timeout: 8000 },
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" onClick={onClose} />
      <div ref={panelRef} className="relative w-full sm:max-w-md bg-[#fffdf8] dark:bg-[#1c100a] border border-[#d4af37]/30 rounded-t-2xl sm:rounded-2xl p-5 max-h-[85dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-[#2b1a12] dark:text-[#fcf8f2]">{title}</h2>
          <button ref={closeRef} onClick={onClose} aria-label="Cerrar sucursales" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-[#f3e7d3] dark:bg-[#2b170e] text-[#8a6216] dark:text-[#e5c158] border border-[#d4af37]/25 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-[#7a5c48] dark:text-[#bda393] mb-4">{SHOW_FACTORY_VISIT ? 'Visitános en Sucre: elegí la ruta más cercana, la lista completa o la fábrica.' : 'Visitános en Sucre: elegí la ruta más cercana o la lista completa.'}</p>

        {/* Option 1: route to the nearest storefront */}
        <section aria-label="Ruta a la más cercana" className="rounded-2xl border border-[#d4af37]/30 bg-[#faf6ef] dark:bg-[#25130b] p-4 mb-3">
          <h3 className="text-sm font-bold text-[#2b1a12] dark:text-[#fcf8f2] flex items-center gap-2">
            <Navigation className="w-4 h-4 text-[#d4af37]" /> Ruta a la más cercana
          </h3>
          <p className="text-xs text-[#7a5c48] dark:text-[#bda393] mt-1 mb-3">
            Usaremos tu ubicación para llevarte a la sucursal más cercana y armar la ruta en Google Maps. Si preferís no compartirla, igual podés ver todas abajo.
          </p>
          <button
            type="button"
            onClick={requestNearestRoute}
            disabled={geoStatus === 'loading'}
            className="min-h-[44px] w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#8a6216] dark:via-[#e5c158] to-[#b8860b] text-[#1a0f08] text-sm font-bold px-4 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
          >
            <LocateFixed className="w-4 h-4" />
            {geoStatus === 'loading' ? 'Localizando…' : 'Ir a la sucursal más cercana'}
          </button>
          {geoStatus === 'loading' && (
            <p role="status" className="text-xs text-[#8a6216] dark:text-[#e5c158] font-semibold mt-2">
              Localizando tu ubicación para encontrar la sucursal más cercana…
            </p>
          )}
          {geoStatus === 'ready' && nearestLabel !== null && (
            <p role="status" className="text-xs text-[#8a6216] dark:text-[#e5c158] font-semibold mt-2">
              Abriendo ruta a {nearestLabel}.
            </p>
          )}
          {geoStatus === 'ready' && nearestLabel === null && userCoords !== null && (
            <p role="status" className="text-xs text-[#8a6216] dark:text-[#e5c158] font-semibold mt-2">
              Ubicación lista: la ruta se abrió en Google Maps.
            </p>
          )}
          {geoMessage !== null && (
            <p role="alert" className="text-xs font-semibold text-[#b3261e] dark:text-[#f0a6a6] mt-2">{geoMessage}</p>
          )}
        </section>

        {/* Option 2: all retail branches */}
        <section aria-label="Ver todas" className="mb-3">
          <h3 className="text-sm font-bold text-[#2b1a12] dark:text-[#fcf8f2] flex items-center gap-2 mb-2">
            <Store className="w-4 h-4 text-[#d4af37]" /> Ver todas
          </h3>
          <ul className="flex flex-col gap-2">
            {BRANCHES.map((branch) => {
              const searchUrl = buildMapsSearchUrl(branchSearchQuery(branch));
              const dirUrl = buildMapsDirUrl(branchSearchQuery(branch), userCoords ?? undefined);
              return (
                <li key={branch.name} className="rounded-2xl border border-[#d4af37]/25 bg-white dark:bg-[#25130b] p-3">
                  <p className="text-sm font-bold text-[#2b1a12] dark:text-[#fcf8f2]">{branch.name}</p>
                  <p className="text-xs text-[#7a5c48] dark:text-[#bda393] flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-[#d4af37] shrink-0" /> {branch.address}
                  </p>
                  <p className="text-xs text-[#7a5c48] dark:text-[#bda393] flex items-center gap-1 mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-[#d4af37] shrink-0" /> {branch.hours}
                  </p>
                  <p className="text-xs text-[#7a5c48] dark:text-[#bda393] flex items-center gap-1 mt-0.5">
                    <Phone className="w-3.5 h-3.5 text-[#d4af37] shrink-0" /> {branch.phone}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <a href={searchUrl} target="_blank" rel="noreferrer" className="flex-1 min-h-[44px] flex items-center justify-center rounded-xl border border-[#d4af37]/50 text-[#8a6216] dark:text-[#e5c158] text-xs font-bold hover:bg-[#d4af37]/15 cursor-pointer">
                      Ver en Maps
                    </a>
                    <a href={dirUrl} target="_blank" rel="noreferrer" className="flex-1 min-h-[44px] flex items-center justify-center rounded-xl bg-[#f3e7d3] dark:bg-[#2b170e] border border-[#d4af37]/25 text-[#8a6216] dark:text-[#e5c158] text-xs font-bold cursor-pointer">
                      Cómo llegar
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Option 3: factory visit (hidden for brands with no public factory access, e.g. chocolates-sucre) */}
        {SHOW_FACTORY_VISIT && (
        <section aria-label="Visitar fábrica" className="rounded-2xl border border-[#d4af37]/30 bg-[#faf6ef] dark:bg-[#25130b] p-4">
          <h3 className="text-sm font-bold text-[#2b1a12] dark:text-[#fcf8f2] flex items-center gap-2">
            <Factory className="w-4 h-4 text-[#d4af37]" /> Visitar fábrica
          </h3>
          <p className="text-sm font-bold text-[#2b1a12] dark:text-[#fcf8f2] mt-1">{FACTORY.name}</p>
          <p className="text-xs text-[#7a5c48] dark:text-[#bda393] flex items-center gap-1 mt-0.5">
            <MapPin className="w-3.5 h-3.5 text-[#d4af37] shrink-0" /> {FACTORY.address}
          </p>
          <p className="text-xs text-[#7a5c48] dark:text-[#bda393] flex items-center gap-1 mt-0.5">
            <Clock className="w-3.5 h-3.5 text-[#d4af37] shrink-0" /> {FACTORY.hours}
          </p>
          <p className="text-xs text-[#7a5c48] dark:text-[#bda393] flex items-center gap-1 mt-0.5">
            <Phone className="w-3.5 h-3.5 text-[#d4af37] shrink-0" /> {FACTORY.phone}
          </p>
          <div className="flex gap-2 mt-3">
            <a href={buildMapsSearchUrl(`${FACTORY.name}, ${FACTORY.address}`)} target="_blank" rel="noreferrer" className="flex-1 min-h-[44px] flex items-center justify-center rounded-xl border border-[#d4af37]/50 text-[#8a6216] dark:text-[#e5c158] text-xs font-bold hover:bg-[#d4af37]/15 cursor-pointer">
              Ver en Maps
            </a>
            <a href={buildMapsDirUrl(FACTORY_DIR_QUERY, userCoords ?? undefined)} target="_blank" rel="noreferrer" className="flex-1 min-h-[44px] flex items-center justify-center rounded-xl bg-gradient-to-r from-[#d4af37] via-[#8a6216] dark:via-[#e5c158] to-[#b8860b] text-[#1a0f08] text-xs font-bold hover:scale-[1.01] active:scale-95 transition-all cursor-pointer">
              Cómo llegar a fábrica
            </a>
          </div>
        </section>
        )}
      </div>
    </div>
  );
};
