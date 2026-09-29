// Real "Chocolates Taboada" retail + factory locations in Sucre / Yamparáez.
// Coordinates resolved via Nominatim (OpenStreetMap) 2026-09-29 — refine
// with on-site GPS if storefront entrances differ from street centroids.
// Street-centroid entries are marked approximate (house-number level).
import type { ParaTiLocation } from './paraTiLocations';

// Search query that lets Google pick the nearest "Taboada" storefront.
export const NEAREST_SEARCH_QUERY = 'Chocolates Taboada, Sucre';

// Full factory query used for the "how to get to the factory" directions link.
export const FACTORY_DIR_QUERY =
  'Chocolates Taboada Fábrica Daniel Campos Sucre';

export const BRANCHES: ParaTiLocation[] = [
  {
    name: 'Agencia Principal',
    address: 'Aniceto Arce (esquina Arenales), Sucre',
    hours: 'Lun-Jue 8:00-21:00, Vie-Sáb 8:00-21:30, Dom 9:00-21:00',
    phone: '+591 4 6433147',
    // Approximate: Calle Aniceto Arce street centroid (esquina Arenales
    // needs on-site GPS to pin the exact storefront entrance).
    lat: -19.0423164,
    lng: -65.255653,
  },
  {
    name: 'Terminal de Buses',
    address: 'Av. Ostria Gutierrez (Interior Terminal de Buses), Sucre',
    hours: 'Lun-Vie 8:00-22:00, Sáb-Dom cerrado',
    phone: '+591 4 6438662',
    lat: -19.0396729,
    lng: -65.2468454,
  },
  {
    name: 'Aeropuerto Alcantarí',
    address: 'Aeropuerto Internacional Alcantarí',
    hours: 'Lun-Lun según vuelos (horario no especificado)',
    phone: '+591 4 6451402',
    lat: -19.2431862,
    lng: -65.149044,
  },
];

export const FACTORY: ParaTiLocation = {
  name: 'Fábrica Taboada',
  address: 'Daniel Campos #82 (Zona Surapata), Sucre',
  hours: 'Lun-Vie 8:00-12:00 y 14:00-18:00, finde cerrado',
  phone: '+591 4 6451402',
  // Approximate: Calle Daniel Campos street centroid (house #82 needs
  // on-site GPS to pin the exact entrance).
  lat: -19.0407366,
  lng: -65.259254,
};
