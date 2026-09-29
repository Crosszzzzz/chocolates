// Real "Chocolates Para Ti" retail + factory locations in Sucre.
// Coordinates resolved via Nominatim (OpenStreetMap) 2026-09-29 — refine
// with on-site GPS if storefront entrances differ from street centroids.
export interface ParaTiLocation {
  name: string;
  address: string;
  hours: string;
  phone: string;
  lat?: number;
  lng?: number;
}

// Search query that lets Google pick the nearest "Para Ti" storefront.
export const NEAREST_SEARCH_QUERY = 'Chocolates Para Ti, Sucre';

// Full factory query used for the "how to get to the factory" directions link.
export const FACTORY_DIR_QUERY =
  'Chocolates Para Ti Fábrica Zona Garcilazo Sucre';

export const BRANCHES: ParaTiLocation[] = [
  {
    name: 'Sucursal Principal - Centro',
    address: 'Arenales 7, Sucre',
    hours: 'Lun-Sáb 8:00-21:00, Dom 8:00-20:30',
    phone: '+591 4 6443177',
    lat: -19.0466787,
    lng: -65.2601338,
  },
  {
    name: 'Sucursal Audiencia',
    address: 'Audiencia Nº 68, Sucre',
    hours: 'Lun-Sáb 9:00-20:00, Dom cerrado',
    phone: '+591 4 6437901',
    lat: -19.0491126,
    lng: -65.2590246,
  },
  {
    name: 'Av. Las Américas',
    address: 'Av. Las Americas esquina, Sucre',
    hours: 'Lun-Sáb 9:00-20:00, Dom 11:00-20:00',
    phone: '+591 6454260',
    lat: -19.0454537,
    lng: -65.2458153,
  },
  {
    name: 'Terminal de Buses',
    address: 'Av. Ostria Gutierrez, Sucre',
    hours: 'Lun-Vie 15:00-20:30, Sáb-Dom 14:30-21:00',
    phone: '+591 4 6443113',
    lat: -19.0396729,
    lng: -65.2468454,
  },
];

export const FACTORY: ParaTiLocation = {
  name: 'Fábrica de Chocolates Para Ti',
  address: 'Sucre (Zona Garcilazo)',
  hours: 'Lun-Sáb 8:30-12:15, Dom cerrado',
  phone: '+591 4 6455689',
  lat: -19.0475004,
  lng: -65.2398647,
};
