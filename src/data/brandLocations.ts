// Registry mapping factory id -> retail + factory locations for SucursalesModal.
// Factory ids come from src/data/factories.ts. Unknown ids fall back to Para Ti.
import {
  BRANCHES as PARA_TI_BRANCHES,
  FACTORY as PARA_TI_FACTORY,
  FACTORY_DIR_QUERY as PARA_TI_FACTORY_DIR_QUERY,
  NEAREST_SEARCH_QUERY as PARA_TI_NEAREST_QUERY,
  type ParaTiLocation,
} from './paraTiLocations';
import {
  BRANCHES as TABOADA_BRANCHES,
  FACTORY as TABOADA_FACTORY,
  FACTORY_DIR_QUERY as TABOADA_FACTORY_DIR_QUERY,
  NEAREST_SEARCH_QUERY as TABOADA_NEAREST_QUERY,
} from './taboadaLocations';
import {
  BRANCHES as SUCRE_BRANCHES,
  FACTORY as SUCRE_FACTORY,
  FACTORY_DIR_QUERY as SUCRE_FACTORY_DIR_QUERY,
  NEAREST_SEARCH_QUERY as SUCRE_NEAREST_QUERY,
} from './sucreLocations';

export type BrandLocation = ParaTiLocation;

export interface BrandLocations {
  branches: BrandLocation[];
  factory: BrandLocation;
  nearestQuery: string;
  factoryQuery: string;
  /** Hide the "Visitar fábrica" option (default true). False for brands with no public factory access. */
  showFactoryVisit?: boolean;
}

const PARA_TI: BrandLocations = {
  branches: PARA_TI_BRANCHES,
  factory: PARA_TI_FACTORY,
  nearestQuery: PARA_TI_NEAREST_QUERY,
  factoryQuery: PARA_TI_FACTORY_DIR_QUERY,
};

const TABOADA: BrandLocations = {
  branches: TABOADA_BRANCHES,
  factory: TABOADA_FACTORY,
  nearestQuery: TABOADA_NEAREST_QUERY,
  factoryQuery: TABOADA_FACTORY_DIR_QUERY,
};

const SUCRE: BrandLocations = {
  branches: SUCRE_BRANCHES,
  factory: SUCRE_FACTORY,
  nearestQuery: SUCRE_NEAREST_QUERY,
  factoryQuery: SUCRE_FACTORY_DIR_QUERY,
  // No public factory access — single central point is retail only.
  showFactoryVisit: false,
};

export const BRAND_LOCATIONS: Record<string, BrandLocations> = {
  'para-ti': PARA_TI,
  taboada: TABOADA,
  'chocolates-sucre': SUCRE,
};

export function getBrandLocations(factoryId?: string): BrandLocations {
  if (factoryId !== undefined && BRAND_LOCATIONS[factoryId] !== undefined) {
    return BRAND_LOCATIONS[factoryId];
  }
  return PARA_TI;
}
