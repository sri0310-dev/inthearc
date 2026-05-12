'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Stock, Tab, AppState } from '@/lib/types';
import { DEFAULT_STOCKS } from '@/lib/defaults';
import { computePortfolioValue, isNearTarget } from '@/lib/compute';
import OverviewTab from './tabs/OverviewTab';
import StrategyTab from './tabs/StrategyTab';
import JourneyTab from './tabs/JourneyTab';
import AlertsTab from './tabs/AlertsTab';

// ─── Icons ──────────────────────────────────────────────────────────────────
const icons = {
  overview: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  strategy: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  journey: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
      <line x1="7" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="17" y2="12"/>
    </svg>
  ),
  alerts: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'journey', label: 'Journey' },
  { id: 'alerts', label: 'Alerts' },
];

// ─── State helpers ───────────────────────────────────────────────────────────
function loadState(): Partial<AppState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('swingtrack_state');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveState(state: AppState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('swingtrack_state', JSON.stringify({
      stocks: state.stocks,
      activeCycles: state.activeCycles,
    }));
  } catch {}
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function SwingTradeApp() {
  const saved = loadState();

  const [stocks, setStocks] = useState<Stock[]>(() => {
    if (saved.stocks) {
      return DEFAULT_STOCKS.map((def) => {
        const s = (saved.stocks as Stock[]).find((x) => x.id === def.id);
        return s ? { ...def, ...s, color: def.color, bgClass: def.bgClass, textClass: def.textClass, borderClass: def.borderClass } : def;
      });
    }
    return DEFAULT_STOCKS;
  });

  const [activeCycles, setActiveCycles] = useState<number>(() => saved.activeCycles ?? 3);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [alertsFired, setAlertsFired] = useState<Record<string, number>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist on change
  useEffect(() => {
    saveState({ stocks, activeCycles, activeTab, isFetching, fetchError, lastFetched, refreshInterval, notificationsEnabled, alertsFired });
  }, [stocks, activeCycles]);

  // Auto-refresh
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(fetchPrices, refreshInterval * 60 * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refreshInterval]);

  // Fetch prices on mount
  useEffect(() => { fetchPrices(); }, []);

  const fetchPrices = useCallback(async () => {
    setIsFetching(true);
    setFetchError(false);
    try {
      const res = await fetch('/api/prices');
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setStocks((prev) =>
        prev.map((s) =>
          data[s.ticker] ? { ...s, currentPrice: data[s.ticker] } : s
        )
      );
      setLastFetched(data.fetchedAt ?? new Date().toISOString());
      checkAlerts(data);
    } catch {
      setFetchError(true);
    } finally {
      setIsFetching(false);
    }
  }, []);

  function checkAlerts(prices: Record<string, number>) {
    if (!notificationsEnabled || typeof Notification === 'undefined') return;
    const now = Date.now();
    const COOLDOWN = 10 * 60 * 1000;
    stocks.forEach((stock) => {
      const live = prices[stock.ticker] ?? stock.currentPrice;
      for (let i = 0; i < activeCycles; i++) {
        const cycle = stock.cycles[i];
        if (!cycle) continue;
        const sellKey = `${stock.id}_c${i}_sell`;
        const buyKey = `${stock.id}_c${i}_buy`;
        if (isNearTarget(live, cycle.sell, 0.015) && (!alertsFired[sellKey] || now - alertsFired[sellKey] > COOLDOWN)) {
          new Notification(`${stock.name} — C${i + 1} sell target approaching`, {
            body: `Live $${live.toFixed(2)} near sell target $${cycle.sell.toFixed(2)}`,
          });
          setAlertsFired((prev) => ({ ...prev, [sellKey]: now }));
        }
        if (isNearTarget(live, cycle.buy, 0.015) && (!alertsFired[buyKey] || now - alertsFired[buyKey] > COOLDOWN)) {
          new Notification(`${stock.name} — C${i + 1} buy-back zone`, {
            body: `Live $${live.toFixed(2)} near buy target $${cycle.buy.toFixed(2)}`,
          });
          setAlertsFired((prev) => ({ ...prev, [buyKey]: now }));
        }
      }
    });
  }

  const handleEnableNotifications = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === 'granted');
  }, []);

  const handleCycleUpdate = useCallback((stockId: string, cycleIndex: number, field: 'sell' | 'buy', value: number) => {
    setStocks((prev) =>
      prev.map((s) => {
        if (s.id !== stockId) return s;
        const cycles = [...s.cycles];
        while (cycles.length <= cycleIndex) {
          const last = cycles[cycles.length - 1] ?? { sell: s.currentPrice * 1.15, buy: s.currentPrice * 1.05 };
          cycles.push({ sell: last.sell * 1.05, buy: last.buy * 1.05 });
        }
        cycles[cycleIndex] = { ...cycles[cycleIndex], [field]: value };
        return { ...s, cycles };
      })
    );
  }, []);

  const handleTargetUpdate = useCallback((stockId: string, value: number) => {
    setStocks((prev) => prev.map((s) => s.id === stockId ? { ...s, targetPrice: value } : s));
  }, []);

  // Stale indicator
  const isStale = lastFetched ? (Date.now() - new Date(lastFetched).getTime()) > 5 * 60 * 1000 : false;
  const dotColor = isFetching ? '#F59E0B' : isStale ? '#F59E0B' : '#22C55E';

  const projectedValue = computePortfolioValue(stocks, activeCycles);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)', maxWidth: 680, margin: '0 auto' }}>
      {/* Live price bar */}
      <div style={{ background: 'white', borderBottom: '1px solid var(--border)', padding: '10px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Dot */}
          <div
            style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }}
            className={isFetching ? 'animate-pulse-dot' : ''}
          />
          {/* Tickers */}
          {stocks.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.ticker}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>${s.currentPrice.toFixed(2)}</span>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          {/* Refresh */}
          <button
            onClick={fetchPrices}
            disabled={isFetching}
            style={{
              fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
              background: 'var(--bg-card-2)', border: '1px solid var(--border)',
              color: 'var(--text-2)', cursor: 'pointer', opacity: isFetching ? 0.5 : 1,
            }}
          >
            {isFetching ? '…' : fetchError ? '⚠ Retry' : 'Refresh'}
          </button>
        </div>
        {lastFetched && (
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
            {isStale ? '⚠ Stale · ' : ''}Updated {new Date(lastFetched).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* Desktop tab nav */}
      <div className="hidden sm:flex" style={{ padding: '8px 16px', background: 'white', borderBottom: '1px solid var(--border)', gap: 4, flexShrink: 0 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, border: 'none',
              background: activeTab === tab.id ? 'var(--text)' : 'transparent',
              color: activeTab === tab.id ? 'white' : 'var(--text-2)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Projected:</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: projectedValue >= 1_000_000 ? 'var(--success)' : 'var(--text)' }}>
            ${projectedValue >= 1_000_000 ? (projectedValue / 1_000_000).toFixed(2) + 'M' : (projectedValue / 1000).toFixed(0) + 'K'}
          </span>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 80px', WebkitOverflowScrolling: 'touch' }}>
        {activeTab === 'overview' && (
          <OverviewTab stocks={stocks} activeCycles={activeCycles} onCyclesChange={setActiveCycles} />
        )}
        {activeTab === 'strategy' && (
          <StrategyTab
            stocks={stocks}
            activeCycles={activeCycles}
            onCyclesChange={setActiveCycles}
            onCycleUpdate={handleCycleUpdate}
            onTargetUpdate={handleTargetUpdate}
          />
        )}
        {activeTab === 'journey' && (
          <JourneyTab stocks={stocks} activeCycles={activeCycles} />
        )}
        {activeTab === 'alerts' && (
          <AlertsTab
            stocks={stocks}
            activeCycles={activeCycles}
            notificationsEnabled={notificationsEnabled}
            refreshInterval={refreshInterval}
            lastFetched={lastFetched}
            onEnableNotifications={handleEnableNotifications}
            onRefreshIntervalChange={setRefreshInterval}
            onRefresh={fetchPrices}
          />
        )}
      </div>

      {/* Mobile bottom tab bar */}
      <div
        className="sm:hidden"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 680, margin: '0 auto',
          background: 'white', borderTop: '1px solid var(--border)',
          display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)',
          zIndex: 50,
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '8px 4px', gap: 3, border: 'none', background: 'transparent', cursor: 'pointer',
                color: isActive ? 'var(--text)' : 'var(--text-3)', transition: 'all 0.15s',
                minHeight: 56,
              }}
            >
              <div style={{ position: 'relative' }}>
                {icons[tab.id]}
                {tab.id === 'alerts' && stocks.some((s) =>
                  s.cycles.slice(0, activeCycles).some((c) =>
                    isNearTarget(s.currentPrice, c.sell) || isNearTarget(s.currentPrice, c.buy)
                  )
                ) && (
                  <div style={{
                    position: 'absolute', top: -2, right: -2, width: 8, height: 8,
                    borderRadius: '50%', background: 'var(--danger)',
                  }} />
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500 }}>{tab.label}</span>
              {isActive && (
                <div style={{ width: 20, height: 2.5, borderRadius: 2, background: 'var(--text)', marginTop: -2 }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
