'use client';
import { useMemo } from 'react';
import { Stock } from '@/lib/types';
import { isNearTarget } from '@/lib/compute';

interface Props {
  stocks: Stock[];
  activeCycles: number;
  notificationsEnabled: boolean;
  refreshInterval: number;
  lastFetched: string | null;
  onEnableNotifications: () => void;
  onRefreshIntervalChange: (v: number) => void;
  onRefresh: () => void;
}

const INTERVALS = [
  { label: 'Off', value: 0 },
  { label: '1 min', value: 1 },
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
];

interface AlertRow {
  stock: Stock;
  cycleIndex: number;
  type: 'SELL' | 'BUY';
  target: number;
  nearTarget: boolean;
  distPct: number;
}

export default function AlertsTab({
  stocks,
  activeCycles,
  notificationsEnabled,
  refreshInterval,
  lastFetched,
  onEnableNotifications,
  onRefreshIntervalChange,
  onRefresh,
}: Props) {
  const alertRows = useMemo<AlertRow[]>(() => {
    const rows: AlertRow[] = [];
    stocks.forEach((stock) => {
      for (let i = 0; i < activeCycles; i++) {
        const cycle = stock.cycles[i];
        if (!cycle) continue;
        const sellNear = isNearTarget(stock.currentPrice, cycle.sell);
        const buyNear = isNearTarget(stock.currentPrice, cycle.buy);
        const sellDist = ((cycle.sell - stock.currentPrice) / stock.currentPrice) * 100;
        const buyDist = ((cycle.buy - stock.currentPrice) / stock.currentPrice) * 100;
        rows.push({ stock, cycleIndex: i, type: 'SELL', target: cycle.sell, nearTarget: sellNear, distPct: sellDist });
        rows.push({ stock, cycleIndex: i, type: 'BUY', target: cycle.buy, nearTarget: buyNear, distPct: buyDist });
      }
    });
    return rows;
  }, [stocks, activeCycles]);

  const nearCount = alertRows.filter((r) => r.nearTarget).length;

  const fmt = (dt: string) => {
    const d = new Date(dt);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="animate-slide-up pb-6 space-y-4">
      {/* Notification controls */}
      <div className="rounded-2xl bg-white border border-[var(--border)] p-4 card-hover">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-bold text-[var(--text)]">Push Alerts</div>
            <div className="text-xs text-[var(--text-2)] mt-0.5">
              {notificationsEnabled
                ? 'Fires within 1.5% of any target'
                : 'Enable to get notified near targets'}
            </div>
          </div>
          <button
            onClick={onEnableNotifications}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95"
            style={{
              background: notificationsEnabled ? 'var(--success-bg)' : 'var(--text)',
              color: notificationsEnabled ? 'var(--success)' : 'white',
            }}
          >
            {notificationsEnabled ? '🔔 On' : 'Enable Alerts'}
          </button>
        </div>
        {nearCount > 0 && (
          <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-600 animate-pulse">
            ⚡ {nearCount} alert{nearCount > 1 ? 's' : ''} near target right now!
          </div>
        )}
      </div>

      {/* Auto-refresh */}
      <div className="rounded-2xl bg-white border border-[var(--border)] p-4 card-hover">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-[var(--text)]">Auto-Refresh</div>
          {lastFetched && (
            <div className="text-xs text-[var(--text-2)]">Updated {fmt(lastFetched)}</div>
          )}
        </div>
        <div className="flex gap-2">
          {INTERVALS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onRefreshIntervalChange(opt.value)}
              className="flex-1 py-2 rounded-xl text-xs font-bold transition-all active:scale-95"
              style={{
                background: refreshInterval === opt.value ? 'var(--text)' : 'var(--bg-card-2)',
                color: refreshInterval === opt.value ? 'white' : 'var(--text-2)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={onRefresh}
          className="mt-3 w-full py-2.5 rounded-xl text-sm font-bold bg-[var(--bg-card-2)] text-[var(--text)] hover:bg-[var(--border)] active:scale-95 transition-all"
        >
          Refresh Prices Now
        </button>
      </div>

      {/* Alerts list */}
      <div className="rounded-2xl bg-white border border-[var(--border)] overflow-hidden card-hover">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="text-sm font-bold text-[var(--text)]">Active Alerts</div>
          <div className="text-xs text-[var(--text-2)] mt-0.5">{alertRows.length} targets across {activeCycles} cycles</div>
        </div>

        {stocks.map((stock) => {
          const stockRows = alertRows.filter((r) => r.stock.id === stock.id);
          if (stockRows.length === 0) return null;
          return (
            <div key={stock.id}>
              <div className="px-4 py-2 flex items-center gap-2" style={{ background: stock.color + '0D' }}>
                <div className="w-2 h-2 rounded-full" style={{ background: stock.color }} />
                <span className="text-xs font-bold" style={{ color: stock.color }}>{stock.name}</span>
                <span className="text-xs text-[var(--text-2)]">live ${stock.currentPrice.toFixed(2)}</span>
              </div>
              {stockRows.map((row, ri) => (
                <AlertRow key={ri} row={row} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AlertRow({ row }: { row: AlertRow }) {
  const isSell = row.type === 'SELL';
  const color = row.nearTarget ? 'var(--danger)' : isSell ? 'var(--warning)' : 'var(--success)';
  const bg = row.nearTarget ? 'var(--danger-bg)' : isSell ? 'var(--warning-bg)' : 'var(--success-bg)';
  const sign = row.distPct >= 0 ? '+' : '';

  return (
    <div
      className="px-4 py-3 flex items-center gap-3 border-b border-[var(--border)] last:border-0 transition-colors"
      style={{ background: row.nearTarget ? '#FFF1F1' : 'white' }}
    >
      {/* Type badge */}
      <div
        className="text-[10px] font-bold px-2 py-1 rounded-lg min-w-[44px] text-center"
        style={{ background: bg, color }}
      >
        {row.nearTarget ? '🚨' : ''}{row.type}
      </div>

      {/* Target */}
      <div className="flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-[var(--text)]">${row.target.toFixed(2)}</span>
          <span className="text-[10px] font-medium" style={{ background: row.stock.color + '22', color: row.stock.color, padding: '1px 5px', borderRadius: 8 }}>
            C{row.cycleIndex + 1}
          </span>
          {row.nearTarget && (
            <span className="text-[10px] font-bold text-red-600 animate-pulse">NEAR TARGET!</span>
          )}
        </div>
        <div className="text-[11px] text-[var(--text-2)] mt-0.5">
          {row.nearTarget
            ? `live $${row.stock.currentPrice.toFixed(2)} — entering zone!`
            : `${sign}${row.distPct.toFixed(1)}% from live $${row.stock.currentPrice.toFixed(2)}`}
        </div>
      </div>

      {/* Distance indicator */}
      <div className="text-sm font-bold" style={{ color }}>
        {sign}{row.distPct.toFixed(1)}%
      </div>
    </div>
  );
}
