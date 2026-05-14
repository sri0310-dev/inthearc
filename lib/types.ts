export interface CycleTarget {
  sell: number;
  buy: number;
  sellQty?: number;       // undefined = full position
  chasePercent?: number;  // % above sell to chase back in, default 12
  activeTrade?: {
    soldAt: number;       // actual executed sell price
    soldQty: number;      // actual qty sold
  };
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
  sharesAfter: number;        // optimal: GTC fires at buy price
  sharesAfterChase: number;   // worst case: chased back in above sell
  gainShares: number;
  gainPct: number;
  sell: number;
  buy: number;
  tradeQty: number;           // shares actually sold
  coreQty: number;            // shares held throughout
  chasePrice: number;         // price at which user chases back in
  isPartial: boolean;         // sellQty < full position
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
