import { NextResponse } from 'next/server';

const TICKERS = ['NBIS', 'CIFR', 'IREN'];
const FALLBACK: Record<string, number> = { NBIS: 187.49, CIFR: 20.28, IREN: 55.15 };

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

// Strategy 1: Yahoo Finance v7 batch quote (one request, more reliable)
async function fetchBatch(): Promise<Record<string, number> | null> {
  try {
    const symbols = TICKERS.join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,symbol`;
    const res = await fetch(url, { headers: HEADERS, signal: withTimeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const quotes: Array<{ symbol: string; regularMarketPrice: number }> =
      data?.quoteResponse?.result ?? [];
    if (!quotes.length) return null;
    const out: Record<string, number> = {};
    for (const q of quotes) {
      if (q.symbol && typeof q.regularMarketPrice === 'number' && q.regularMarketPrice > 0) {
        out[q.symbol] = q.regularMarketPrice;
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

// Strategy 2: Yahoo Finance v8 chart per-ticker (original approach, fallback)
async function fetchChart(ticker: string): Promise<number | null> {
  for (const host of ['query1', 'query2']) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
      const res = await fetch(url, { headers: HEADERS, signal: withTimeout(5000) });
      if (!res.ok) continue;
      const data = await res.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof price === 'number' && price > 0) return price;
    } catch { /* try next */ }
  }
  return null;
}

// Strategy 3: Yahoo Finance v10 quoteSummary
async function fetchQuoteSummary(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=price`;
    const res = await fetch(url, { headers: HEADERS, signal: withTimeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.quoteSummary?.result?.[0]?.price?.regularMarketPrice?.raw;
    return typeof price === 'number' && price > 0 ? price : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const prices: Record<string, number> = {};
  let source = 'fallback';

  // Try batch first
  const batch = await fetchBatch();
  if (batch && Object.keys(batch).length >= TICKERS.length) {
    for (const t of TICKERS) prices[t] = batch[t] ?? FALLBACK[t];
    source = 'yahoo_v7_batch';
  } else {
    // Partial batch or failed — fill in what we got then fetch missing individually
    const got = batch ?? {};
    await Promise.all(
      TICKERS.map(async (ticker) => {
        if (got[ticker]) {
          prices[ticker] = got[ticker];
          return;
        }
        const c = await fetchChart(ticker);
        if (c !== null) { prices[ticker] = c; return; }
        const q = await fetchQuoteSummary(ticker);
        if (q !== null) { prices[ticker] = q; return; }
        prices[ticker] = FALLBACK[ticker];
      })
    );
    const allFromLive = TICKERS.every((t) => prices[t] !== FALLBACK[t]);
    source = allFromLive ? 'yahoo_v8_chart' : 'partial_fallback';
  }

  return NextResponse.json({
    ...prices,
    fetchedAt: new Date().toISOString(),
    source,
  });
}
