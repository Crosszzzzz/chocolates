export interface ProductSpec {
  id: string;
  name: string;
  subtitle: string;
  cacaoPercentage: number;
  weight: string;
  dimensions: string;
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

export type RoutePhase = 'archipelago' | 'diving' | 'corridor' | 'chamber' | 'unwrap';
