import { Stock, CycleResult, StockProjection, CycleTarget } from './types';

export function computeCycles(
  initialShares: number,
  cycles: CycleTarget[],
  numCycles: number
): CycleResult[] {
  const results: CycleResult[] = [];
  let shares = initialShares;

  for (let i = 0; i < numCycles; i++) {
    const raw = cycles[i];
    const cycle: CycleTarget = raw ?? {
      sell: (cycles[cycles.length - 1]?.sell ?? shares * 1.15) * 1.05,
      buy: (cycles[cycles.length - 1]?.buy ?? shares * 1.05) * 1.05,
    };
    const { sell, buy } = cycle;
    const valid = sell > 0 && buy > 0 && sell > buy;

    const tradeQty = Math.min(cycle.sellQty ?? shares, shares);
    const coreQty = shares - tradeQty;
    const isPartial = tradeQty < shares;

    const chasePct = cycle.chasePercent ?? 12;
    const chasePrice = sell * (1 + chasePct / 100);

    const sharesAfter = valid ? coreQty + tradeQty * (sell / buy) : shares;
    const sharesAfterChase = valid ? coreQty + tradeQty * (sell / chasePrice) : shares;
    const gainShares = sharesAfter - shares;
    const gainPct = valid ? (sharesAfter / shares - 1) * 100 : 0;

    results.push({
      sharesBefore: shares, sharesAfter, sharesAfterChase,
      gainShares, gainPct, sell, buy,
      tradeQty, coreQty, chasePrice, isPartial, valid,
    });
    shares = sharesAfter;
  }
  return results;
}

export function computeProjection(stock: Stock, numCycles: number): StockProjection {
  const cycleResults = computeCycles(stock.initialShares, stock.cycles, numCycles);
  const finalShares =
    cycleResults.length > 0
      ? cycleResults[cycleResults.length - 1].sharesAfter
      : stock.initialShares;
  const valueAtTarget = finalShares * stock.targetPrice;
  return { stock, cycleResults, finalShares, valueAtTarget };
}

export function computePortfolioValue(stocks: Stock[], numCycles: number): number {
  return stocks.reduce((total, stock) => {
    const proj = computeProjection(stock, numCycles);
    return total + proj.valueAtTarget;
  }, 0);
}

export function computeCurrentPortfolioValue(stocks: Stock[]): number {
  return stocks.reduce((total, s) => total + s.initialShares * s.currentPrice, 0);
}

export function computeAtTargetTodayValue(stocks: Stock[]): number {
  return stocks.reduce((total, s) => total + s.initialShares * s.targetPrice, 0);
}

export function findCyclesToMillion(stocks: Stock[]): number | null {
  for (let n = 1; n <= 20; n++) {
    if (computePortfolioValue(stocks, n) >= 1_000_000) return n;
  }
  return null;
}

export function findMilestoneCycle(
  stocks: Stock[],
  target: number
): number | null {
  for (let n = 0; n <= 20; n++) {
    if (computePortfolioValue(stocks, n) >= target) return n;
  }
  return null;
}

export function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function fmtShares(n: number): string {
  if (n >= 100_000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

export function isNearTarget(livePrice: number, target: number, threshold = 0.03): boolean {
  return Math.abs(livePrice - target) / target < threshold;
}

export function priceDist(live: number, target: number): string {
  const pct = ((target - live) / live) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}
