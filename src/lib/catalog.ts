// M10 catalog search (adapted stack: Supabase + Vercel serverless).
// searchCatalog(q): live GET /api/search, falling back to fetchCatalog() with
// client-side filtering when the endpoint or DB is down.
// Rollback: delete this file + SearchBox usage; the shop keeps fetchCatalog() only.
import { fetchCatalog, type CatalogEntry } from '../data/factories';

/** Case-insensitive substring match on nameEs/sku. Pure. Empty query => []. */
export function filterCatalogLocal(entries: CatalogEntry[], q: unknown): CatalogEntry[] {
  if (typeof q !== 'string') return [];
  const term = q.trim().toLowerCase();
  if (term === '') return [];
  return entries.filter(
    (e) => e.nameEs.toLowerCase().includes(term) || e.sku.toLowerCase().includes(term),
  );
}

/**
 * Search the catalog. Returns live /api/search results (fromDb: true), or the
 * local fallback filtered client-side (fromDb: false). Empty query => [].
 */
export async function searchCatalog(q: unknown): Promise<{ entries: CatalogEntry[]; fromDb: boolean }> {
  if (typeof q !== 'string' || q.trim() === '') return { entries: [], fromDb: true };
  const clean = q.trim();
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(clean)}`);
    if (!res.ok) throw new Error('search-down');
    const data = (await res.json()) as { products?: CatalogEntry[] };
    if (!Array.isArray(data.products)) throw new Error('bad-shape');
    return { entries: data.products, fromDb: true };
  } catch {
    const { entries } = await fetchCatalog();
    return { entries: filterCatalogLocal(entries, clean), fromDb: false };
  }
}
