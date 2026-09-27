// Optional image-facade layer for floating islands.
//
// Production ships procedural islands only; no `/images/islands/<id>.jpg`
// files exist in the repo. This module resolves the conventional URL and
// preloads it with `new Image()` + onload/onerror so callers can upgrade to
// an image facade on success and silently keep the procedural render on
// error. Results are cached per island id and never throw.

const facadeCache = new Map<string, Promise<boolean>>();
const loadedFacades = new Set<string>();

export function getIslandFacadeUrl(id: string): string {
  return `/images/islands/${id}.jpg`;
}

export function isIslandFacadeLoaded(id: string): boolean {
  return loadedFacades.has(id);
}

export function preloadIslandFacade(id: string): Promise<boolean> {
  const cached = facadeCache.get(id);
  if (cached) return cached;

  const task = new Promise<boolean>((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        loadedFacades.add(id);
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = getIslandFacadeUrl(id);
    } catch {
      resolve(false);
    }
  });
  facadeCache.set(id, task);
  return task;
}

/** Test-only helper to reset the module caches. */
export function clearIslandFacadeCache(): void {
  facadeCache.clear();
  loadedFacades.clear();
}
