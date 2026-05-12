import { NextResponse } from 'next/server';

const TICKERS = ['NBIS', 'CIFR', 'IREN'];
const FALLBACK: Record<string, number> = { NBIS: 187.49, CIFR: 20.25, IREN: 9.5 };

async function fetchYahooPrice(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SwingTrack/1.0)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === 'number' && price > 0 ? price : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const prices: Record<string, number> = {};
  let anyFailed = false;

  await Promise.all(
    TICKERS.map(async (ticker) => {
      const price = await fetchYahooPrice(ticker);
      if (price !== null) {
        prices[ticker] = price;
      } else {
        prices[ticker] = FALLBACK[ticker];
        anyFailed = true;
      }
    })
  );

  return NextResponse.json({
    ...prices,
    fetchedAt: new Date().toISOString(),
    source: anyFailed ? 'partial_fallback' : 'yahoo',
  });
}
