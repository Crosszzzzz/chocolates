// Real "Chocolates Sucre" retail + central attention point in Sucre.
// Coordinates resolved via Nominatim (OpenStreetMap) 2026-09-29 — Calle
// Capitán Agustín Ravelo street centroid (-19.0442275, -65.2613779); refine
// with on-site GPS if the storefront entrance differs. Single location
// serves as both branch and factory-visit target (no separate plant given).
import type { ParaTiLocation } from './paraTiLocations';

// Search query that lets Google pick the nearest "Sucre" storefront.
export const NEAREST_SEARCH_QUERY = 'Chocolates Sucre, Sucre';

// Full factory query used for the "how to get to the factory" directions link.
export const FACTORY_DIR_QUERY = 'Chocolates Sucre Calle Ravelo Sucre';

export const BRANCHES: ParaTiLocation[] = [
  {
    name: 'Punto Central',
    address: 'Calle Ravelo, Sucre',
    hours: 'Lun-Dom 8:00-21:30',
    phone: '+591 67289303',
    // Approximate: Calle Capitán Agustín Ravelo street centroid (house
    // number needs on-site GPS to pin the exact storefront entrance).
    lat: -19.0442275,
    lng: -65.2613779,
  },
];

export const FACTORY: ParaTiLocation = {
  name: 'Punto de atención central — Chocolates Sucre',
  address: 'Calle Ravelo, Sucre',
  hours: 'Lun-Dom 8:00-21:30',
  phone: '+591 67289303',
  // Approximate: same street centroid as Punto Central (no separate plant).
  lat: -19.0442275,
  lng: -65.2613779,
};
