export const runtime = 'edge';

const TICKERS = ['NBIS', 'CIFR', 'IREN'];
const FALLBACK: Record<string, number> = { NBIS: 187.49, CIFR: 20.28, IREN: 55.15 };

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
  'Origin': 'https://finance.yahoo.com',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function timedFetch(url: string, opts: RequestInit, ms = 7000): Promise<Response> {
  return Promise.race([fetch(url, opts), timeout(ms)]) as Promise<Response>;
}

// v7 batch — all tickers in one shot
async function fetchV7Batch(): Promise<Record<string, number> | null> {
  try {
    const symbols = TICKERS.join(',');
    const res = await timedFetch(
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,symbol`,
      { headers: BROWSER_HEADERS }
    );
    if (!res.ok) return null;
    const data = await res.json() as { quoteResponse: { result: Array<{ symbol: string; regularMarketPrice: number }> } };
    const quotes = data?.quoteResponse?.result ?? [];
    if (!quotes.length) return null;
    const out: Record<string, number> = {};
    for (const q of quotes) {
      if (q.symbol && typeof q.regularMarketPrice === 'number' && q.regularMarketPrice > 0)
        out[q.symbol] = q.regularMarketPrice;
    }
    return Object.keys(out).length >= TICKERS.length ? out : null;
  } catch { return null; }
}

// v8 chart per-ticker — tried on two hosts
async function fetchV8Chart(ticker: string): Promise<number | null> {
  for (const host of ['query1', 'query2']) {
    try {
      const res = await timedFetch(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
        { headers: BROWSER_HEADERS }
      );
      if (!res.ok) continue;
      const data = await res.json() as { chart: { result: Array<{ meta: { regularMarketPrice: number } }> } };
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof price === 'number' && price > 0) return price;
    } catch { /* try next host */ }
  }
  return null;
}

// v6 marketSummary — different code path, less monitored
async function fetchV6(ticker: string): Promise<number | null> {
  try {
    const res = await timedFetch(
      `https://query1.finance.yahoo.com/v6/finance/quote?symbols=${ticker}`,
      { headers: BROWSER_HEADERS }
    );
    if (!res.ok) return null;
    const data = await res.json() as { quoteResponse: { result: Array<{ regularMarketPrice: number }> } };
    const price = data?.quoteResponse?.result?.[0]?.regularMarketPrice;
    return typeof price === 'number' && price > 0 ? price : null;
  } catch { return null; }
}

export async function GET() {
  const prices: Record<string, number> = {};

  // Try batch first
  const batch = await fetchV7Batch();
  if (batch) {
    for (const t of TICKERS) prices[t] = batch[t] ?? FALLBACK[t];
    return Response.json({ ...prices, fetchedAt: new Date().toISOString(), source: 'v7_batch' });
  }

  // Individual fallbacks in parallel
  await Promise.all(TICKERS.map(async (ticker) => {
    const p =
      (await fetchV8Chart(ticker)) ??
      (await fetchV6(ticker)) ??
      FALLBACK[ticker];
    prices[ticker] = p;
  }));

  const usedFallback = TICKERS.some(t => prices[t] === FALLBACK[t]);
  return Response.json({
    ...prices,
    fetchedAt: new Date().toISOString(),
    source: usedFallback ? 'partial_fallback' : 'v8_chart',
  });
}
