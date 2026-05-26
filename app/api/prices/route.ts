export const runtime = 'edge';

const TICKERS = ['NBIS', 'CIFR', 'IREN'];
const FALLBACK: Record<string, number> = { NBIS: 220.74, CIFR: 22.76, IREN: 58.78 };

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function abortAfter(ms: number): { signal: AbortSignal; clear: () => void } {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, clear: () => clearTimeout(t) };
}

// NASDAQ public API — works from Cloudflare edge IPs, no auth required
async function fetchNasdaq(ticker: string): Promise<number | null> {
  const { signal, clear } = abortAfter(5000);
  try {
    const res = await fetch(
      `https://api.nasdaq.com/api/quote/${ticker}/info?assetClass=stocks`,
      { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, signal }
    );
    clear();
    if (!res.ok) return null;
    const data = await res.json() as { data: { primaryData: { lastSalePrice: string } } };
    const raw = data?.data?.primaryData?.lastSalePrice;
    if (!raw) return null;
    const price = parseFloat(raw.replace(/[^0-9.]/g, ''));
    return price > 0 ? price : null;
  } catch { clear(); return null; }
}

// Yahoo Finance v8 chart — fallback if NASDAQ is unavailable
async function fetchYahooChart(ticker: string): Promise<number | null> {
  const { signal, clear } = abortAfter(5000);
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
      {
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json',
          'Referer': 'https://finance.yahoo.com/',
        },
        signal,
      }
    );
    clear();
    if (!res.ok) return null;
    const data = await res.json() as { chart: { result: Array<{ meta: { regularMarketPrice: number } }> } };
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === 'number' && price > 0 ? price : null;
  } catch { clear(); return null; }
}

export async function GET() {
  // Fetch all tickers in parallel from NASDAQ
  const nasdaqResults = await Promise.all(TICKERS.map(fetchNasdaq));
  const prices: Record<string, number> = {};

  // For any that failed, try Yahoo Chart as fallback
  const yahooNeeded = TICKERS.filter((_, i) => nasdaqResults[i] === null);
  const yahooResults = yahooNeeded.length > 0
    ? await Promise.all(yahooNeeded.map(fetchYahooChart))
    : [];

  for (let i = 0; i < TICKERS.length; i++) {
    const t = TICKERS[i];
    const nasdaq = nasdaqResults[i];
    if (nasdaq !== null) {
      prices[t] = nasdaq;
    } else {
      const yahooIdx = yahooNeeded.indexOf(t);
      prices[t] = yahooResults[yahooIdx] ?? FALLBACK[t];
    }
  }

  const source = nasdaqResults.every(p => p !== null) ? 'nasdaq'
    : yahooNeeded.length < TICKERS.length ? 'nasdaq_partial'
    : TICKERS.some(t => prices[t] === FALLBACK[t]) ? 'fallback'
    : 'yahoo_chart';

  return Response.json({ ...prices, fetchedAt: new Date().toISOString(), source });
}
