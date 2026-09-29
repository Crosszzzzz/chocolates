export interface ProductSpec {
  id: string;
  name: string;
  subtitle: string;
  cacaoPercentage: number;
  weight: string;
  dimensions: string;
  /**
   * Real-world standing height in cm (packaging-print estimate taken from
   * the `dimensions` string, not a caliper measurement). Used to normalize
   * an optional `/models/<sku>.glb` asset so its bounding-box height matches
   * true scale. Bars use their longest edge; boxes resting flat use thickness.
   */
  heightCm: number;
  flavorProfile: string[];
  origin: string;
  description: string;
  pairing: string;
  colorHex: string; // Chocolate bar tone
  wrapperPrimaryColor: string;
  wrapperAccentColor: string;
  badge?: string;
  type: 'bar' | 'box' | 'truffle';
}

export interface HistoryMilestone {
  year: string;
  title: string;
  description: string;
  archivalTopic: string;
  quote?: string;
  accent: string;
}

export interface ChocolateFactory {
  id: 'para-ti' | 'chocolates-sucre' | 'taboada';
  name: string;
  slogan: string;
  foundationYear: number;
  founder: string;
  headquarters: string;
  description: string;
  historicalContext: string;
  islandColor: string;
  brandColor: string;
  accentColor: string;
  islandPosition: [number, number, number];
  historyMilestones: HistoryMilestone[];
  products: ProductSpec[];
}

// 'corridor' is a retired phase: kept in the union so saved/stale values still
// parse, but no UI transition targets it anymore (flow goes diving -> chamber).
export type RoutePhase = 'archipelago' | 'diving' | 'corridor' | 'chamber' | 'unwrap' | 'ar';

// --- Commerce foundation (PR1, mvp-completo) ---
// Extends the static 3D catalog without changing existing ProductSpec behavior.
// DB-backed listing (PR3) maps Supabase rows onto CommerceProduct; 3D views stay untouched.

export interface CommerceProduct extends ProductSpec {
  sku: string;
  priceBOB: number;
  stock: number;
  imageUrl?: string;
}

export interface CartLine {
  sku: string;
  qty: number;
}

export type FulfillmentKind = 'pickup' | 'delivery-sucre';

export interface Order {
  id: string;
  totalBOB: number;
  fulfillment: FulfillmentKind;
  status: 'reserved';
}
