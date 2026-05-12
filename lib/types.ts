export interface CycleTarget {
  sell: number;
  buy: number;
}

export interface Stock {
  id: string;
  name: string;
  ticker: string;
  color: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  initialShares: number;
  currentPrice: number;
  targetPrice: number;
  cycles: CycleTarget[];
}

export interface CycleResult {
  sharesBefore: number;
  sharesAfter: number;
  gainShares: number;
  gainPct: number;
  sell: number;
  buy: number;
  valid: boolean;
}

export interface StockProjection {
  stock: Stock;
  cycleResults: CycleResult[];
  finalShares: number;
  valueAtTarget: number;
}

export type Tab = 'overview' | 'strategy' | 'journey' | 'alerts';

export interface AppState {
  stocks: Stock[];
  activeCycles: number;
  lastFetched: string | null;
  isFetching: boolean;
  fetchError: boolean;
  refreshInterval: number;
  notificationsEnabled: boolean;
  alertsFired: Record<string, number>;
  activeTab: Tab;
}
