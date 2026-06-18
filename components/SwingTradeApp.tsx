'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Stock, Tab, AppState } from '@/lib/types';
import { DEFAULT_STOCKS } from '@/lib/defaults';
import { isNearTarget } from '@/lib/compute';
import OverviewTab from './tabs/OverviewTab';
import StrategyTab from './tabs/StrategyTab';
import AlertsTab from './tabs/AlertsTab';

// ─── Icons ──────────────────────────────────────────────────────────────────
const icons: Record<Tab, React.ReactNode> = {
  portfolio: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  simulate: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <polyline points="5 12 12 5 19 12"/>
      <polyline points="5 12 12 19 19 12" transform="translate(0 8) scale(1 -1) translate(0 -16)"/>
    </svg>
  ),
  alerts: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'simulate', label: 'Simulate' },
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
  const [activeTab, setActiveTab] = useState<Tab>('portfolio');
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [alertsFired, setAlertsFired] = useState<Record<string, number>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Stable ref so the interval always calls the latest fetchPrices
  const fetchPricesRef = useRef<() => void>(() => {});

  const fetchPrices = useCallback(async () => {
    setIsFetching(true);
    setFetchError(false);
    try {
      const res = await fetch('/api/prices', { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setStocks((prev) =>
        prev.map((s) =>
          data[s.ticker] ? { ...s, currentPrice: data[s.ticker] } : s
        )
      );
      setLastFetched(data.fetchedAt ?? new Date().toISOString());
    } catch {
      setFetchError(true);
    } finally {
      setIsFetching(false);
    }
  }, []);

  // Keep ref in sync so the auto-refresh interval always calls the latest fetchPrices
  useEffect(() => { fetchPricesRef.current = fetchPrices; }, [fetchPrices]);

  // Persist on change
  useEffect(() => {
    saveState({ stocks, activeCycles, activeTab, isFetching, fetchError, lastFetched, refreshInterval, notificationsEnabled, alertsFired });
  }, [stocks, activeCycles]);

  // Fetch on mount
  useEffect(() => { fetchPrices(); }, [fetchPrices]);

  // Auto-refresh — interval uses ref so it always calls the latest fetchPrices
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(() => fetchPricesRef.current(), refreshInterval * 60 * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refreshInterval]);

  const handleEnableNotifications = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === 'granted');
  }, []);

  const handleCycleUpdate = useCallback((stockId: string, cycleIndex: number, field: 'sell' | 'buy' | 'sellQty' | 'chasePercent', value: number) => {
    setStocks((prev) =>
      prev.map((s) => {
        if (s.id !== stockId) return s;
        const cycles = [...s.cycles];
        while (cycles.length <= cycleIndex) {
          const last = cycles[cycles.length - 1] ?? { sell: s.currentPrice * 1.15, buy: s.currentPrice * 1.05 };
          cycles.push({ sell: last.sell * 1.05, buy: last.buy * 1.05 });
        }
        // For sellQty: if value > sharesBefore, treat as "All" (undefined)
        if (field === 'sellQty' && value >= s.initialShares) {
          const { sellQty: _removed, ...rest } = cycles[cycleIndex];
          cycles[cycleIndex] = rest;
        } else {
          cycles[cycleIndex] = { ...cycles[cycleIndex], [field]: value };
        }
        return { ...s, cycles };
      })
    );
  }, []);

  const handleActiveTrade = useCallback((
    stockId: string,
    cycleIndex: number,
    trade: { soldAt: number; soldQty: number } | null
  ) => {
    setStocks((prev) =>
      prev.map((s) => {
        if (s.id !== stockId) return s;
        const cycles = [...s.cycles];
        if (!cycles[cycleIndex]) return s;
        cycles[cycleIndex] = { ...cycles[cycleIndex], activeTrade: trade ?? undefined };
        return { ...s, cycles };
      })
    );
  }, []);

  const handleTargetUpdate = useCallback((stockId: string, value: number) => {
    setStocks((prev) => prev.map((s) => s.id === stockId ? { ...s, targetPrice: value } : s));
  }, []);

  const handleAdjustShares = useCallback((stockId: string, newShares: number, note?: string) => {
    setStocks((prev) => prev.map((s) => {
      if (s.id !== stockId) return s;
      const entry = { at: new Date().toISOString(), from: s.initialShares, to: newShares, note };
      return { ...s, initialShares: newShares, adjustmentLog: [...(s.adjustmentLog ?? []), entry] };
    }));
  }, []);

  const isStale = lastFetched ? (Date.now() - new Date(lastFetched).getTime()) > 5 * 60 * 1000 : false;
  const dotColor = isFetching ? '#F59E0B' : fetchError ? '#EF4444' : isStale ? '#F59E0B' : '#22C55E';

  const AUTO_REFRESH_OPTS = [
    { label: 'Off', value: 0 },
    { label: '1m', value: 1 },
    { label: '5m', value: 5 },
    { label: '15m', value: 15 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)', maxWidth: 680, margin: '0 auto' }}>
      {/* Live price bar */}
      <div style={{ background: 'white', borderBottom: '1px solid var(--border)', padding: '8px 16px', flexShrink: 0 }}>
        {/* Row 1: tickers + refresh button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }}
            className={isFetching ? 'animate-pulse-dot' : ''}
          />
          {stocks.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.ticker}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>${s.currentPrice.toFixed(2)}</span>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <button
            onClick={fetchPrices}
            disabled={isFetching}
            style={{
              fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 20,
              background: isFetching ? 'var(--bg-card-2)' : fetchError ? 'var(--danger-bg)' : 'var(--bg-card-2)',
              border: `1px solid ${fetchError ? 'var(--danger)' : 'var(--border)'}`,
              color: fetchError ? 'var(--danger)' : 'var(--text-2)',
              cursor: isFetching ? 'default' : 'pointer',
              opacity: isFetching ? 0.6 : 1,
              transition: 'all 0.15s',
            }}
          >
            {isFetching ? '⟳ Fetching…' : fetchError ? '⚠ Retry' : '⟳ Refresh'}
          </button>
        </div>
        {/* Row 2: timestamp + auto-refresh pills */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }}>
          <div style={{ fontSize: 10, color: isStale ? 'var(--warning)' : 'var(--text-3)' }}>
            {!lastFetched
              ? 'Tap Refresh to fetch live prices'
              : `${isStale ? '⚠ Stale · ' : ''}${new Date(lastFetched).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Auto</span>
            {AUTO_REFRESH_OPTS.map((o) => (
              <button key={o.value} onClick={() => setRefreshInterval(o.value)}
                style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, border: 'none',
                  background: refreshInterval === o.value ? 'var(--text)' : 'var(--bg-card-2)',
                  color: refreshInterval === o.value ? 'white' : 'var(--text-3)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
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
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 80px', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        {activeTab === 'portfolio' && (
          <OverviewTab stocks={stocks} onAdjustShares={handleAdjustShares} />
        )}
        {activeTab === 'simulate' && (
          <StrategyTab
            stocks={stocks}
            activeCycles={activeCycles}
            onCyclesChange={setActiveCycles}
            onCycleUpdate={handleCycleUpdate}
            onTargetUpdate={handleTargetUpdate}
            onActiveTrade={handleActiveTrade}
          />
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
