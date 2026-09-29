// Google Maps search handoff for factory headquarters addresses.
export function buildMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`;
}

// Google Maps directions handoff. Origin is omitted when unknown so Google
// uses the device location instead of a hardcoded placeholder.
export function buildMapsDirUrl(destination: string, origin?: string): string {
  const base = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination.trim())}`;
  const cleanOrigin = origin?.trim() ?? '';
  if (cleanOrigin === '') return base;
  return `${base}&origin=${encodeURIComponent(cleanOrigin)}`;
}

// Haversine distance in km between two lat/lng points.
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sLat = Math.sin(dLat / 2);
  const sLng = Math.sin(dLng / 2);
  const h =
    sLat * sLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sLng *
      sLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}
