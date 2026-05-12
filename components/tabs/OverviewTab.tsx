'use client';
import { useMemo, useRef, useEffect } from 'react';
import { Stock } from '@/lib/types';
import {
  computePortfolioValue,
  computeCurrentPortfolioValue,
  computeAtTargetTodayValue,
  computeProjection,
  findCyclesToMillion,
  findMilestoneCycle,
  fmt,
  fmtShares,
} from '@/lib/compute';

interface Props {
  stocks: Stock[];
  activeCycles: number;
  onCyclesChange: (n: number) => void;
}

const MILESTONES = [
  { label: '$300K', value: 300_000 },
  { label: '$500K', value: 500_000 },
  { label: '$750K', value: 750_000 },
  { label: '$1M', value: 1_000_000 },
];

function PortfolioChart({ stocks, activeCycles }: { stocks: Stock[]; activeCycles: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<unknown>(null);

  useEffect(() => {
    let Chart: typeof import('chart.js').Chart;
    let mounted = true;

    async function init() {
      const { Chart: C, registerables } = await import('chart.js');
      C.register(...registerables);
      Chart = C;
      if (!mounted || !canvasRef.current) return;

      if (chartRef.current) {
        (chartRef.current as import('chart.js').Chart).destroy();
      }

      const labels = ['Now', ...Array.from({ length: 5 }, (_, i) => `C${i + 1}`)];
      const datasets = stocks.map((stock) => ({
        label: stock.name,
        borderColor: stock.color,
        backgroundColor: stock.color + '22',
        data: labels.map((_, i) => {
          if (i === 0) return stock.initialShares * stock.targetPrice;
          const proj = computeProjection(stock, i);
          return proj.valueAtTarget;
        }),
        tension: 0.4,
        fill: false,
        pointRadius: 4,
        pointHoverRadius: 6,
      }));

      const totals = labels.map((_, i) => {
        if (i === 0) return stocks.reduce((s, st) => s + st.initialShares * st.targetPrice, 0);
        return computePortfolioValue(stocks, i);
      });

      datasets.push({
        label: 'Total',
        borderColor: '#1A1A2E',
        backgroundColor: '#1A1A2E11',
        data: totals,
        tension: 0.4,
        fill: false,
        pointRadius: 4,
        pointHoverRadius: 6,
        // @ts-expect-error - borderDash is valid
        borderDash: [5, 3],
      });

      chartRef.current = new Chart(canvasRef.current!, {
        type: 'line',
        data: { labels: labels.slice(0, activeCycles + 1), datasets: datasets.map(d => ({ ...d, data: d.data.slice(0, activeCycles + 1) })) },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: ${fmt(ctx.raw as number)}`,
              },
            },
          },
          scales: {
            x: {
              grid: { color: '#E8E4DC' },
              ticks: { color: '#6B6B80', font: { size: 11 } },
            },
            y: {
              grid: { color: '#E8E4DC' },
              ticks: {
                color: '#6B6B80',
                font: { size: 11 },
                callback: (v) => fmt(v as number),
              },
            },
          },
        },
      });
    }
    init();
    return () => { mounted = false; if (chartRef.current) (chartRef.current as import('chart.js').Chart).destroy(); };
  }, [stocks, activeCycles]);

  return (
    <div style={{ height: 220, position: 'relative' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

export default function OverviewTab({ stocks, activeCycles, onCyclesChange }: Props) {
  const currentValue = useMemo(() => computeCurrentPortfolioValue(stocks), [stocks]);
  const atTargetToday = useMemo(() => computeAtTargetTodayValue(stocks), [stocks]);
  const projectedValue = useMemo(() => computePortfolioValue(stocks, activeCycles), [stocks, activeCycles]);
  const progressPct = useMemo(() => Math.min((projectedValue / 1_000_000) * 100, 100), [projectedValue]);
  const cyclesToMillion = useMemo(() => findCyclesToMillion(stocks), [stocks]);

  const milestones = useMemo(() =>
    MILESTONES.map((m) => ({
      ...m,
      atCycle: findMilestoneCycle(stocks, m.value),
      reached: projectedValue >= m.value,
    })), [stocks, projectedValue]);

  const projections = useMemo(() =>
    stocks.map((s) => computeProjection(s, activeCycles)), [stocks, activeCycles]);

  return (
    <div className="animate-slide-up space-y-4 pb-6">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Current portfolio" value={fmt(currentValue)} sub="live prices" />
        <MetricCard label="At targets · today" value={fmt(atTargetToday)} sub="no accumulation" accent />
        <div className="col-span-2 rounded-2xl p-4 bg-white border border-[var(--border)] card-hover">
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <div className="text-xs text-[var(--text-2)] font-medium uppercase tracking-wide mb-0.5">Projected at targets</div>
              <div className="text-3xl font-bold" style={{ color: projectedValue >= 1_000_000 ? 'var(--success)' : 'var(--text)' }}>
                {fmt(projectedValue)}
              </div>
              <div className="text-xs text-[var(--text-2)] mt-0.5">{activeCycles} cycle{activeCycles !== 1 ? 's' : ''} configured</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold" style={{ color: progressPct >= 100 ? 'var(--success)' : 'var(--cifr)' }}>
                {progressPct.toFixed(1)}%
              </div>
              <div className="text-xs text-[var(--text-2)]">to $1M</div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-3 bg-[var(--bg-card-2)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full progress-glow"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {/* Milestone markers */}
          <div className="flex justify-between mt-1 px-0.5">
            {[30, 50, 75, 100].map((pct) => (
              <div key={pct} className="text-[9px] text-[var(--text-3)]">{pct}%</div>
            ))}
          </div>
        </div>
      </div>

      {/* Cycles control */}
      <div className="rounded-2xl bg-white border border-[var(--border)] p-4 card-hover">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-[var(--text)]">Swing Cycles</div>
          <div className="text-sm font-medium" style={{ color: cyclesToMillion !== null ? 'var(--success)' : 'var(--text-2)' }}>
            {cyclesToMillion !== null
              ? activeCycles >= cyclesToMillion
                ? `✓ $1M unlocked at C${cyclesToMillion}`
                : `${cyclesToMillion} cycles to $1M`
              : '>20 cycles to $1M'}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => onCyclesChange(Math.max(1, activeCycles - 1))}
            className="w-10 h-10 rounded-full bg-[var(--bg-card-2)] text-xl font-bold flex items-center justify-center hover:bg-[var(--border)] active:scale-95 transition-all"
          >−</button>
          <div className="flex-1">
            <input
              type="range" min={1} max={5} step={1} value={activeCycles}
              onChange={(e) => onCyclesChange(Number(e.target.value))}
              className="w-full accent-[var(--text)]"
            />
            <div className="flex justify-between mt-1">
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => onCyclesChange(n)}
                  className="text-xs font-medium w-7 h-6 rounded-full transition-all"
                  style={{ background: n === activeCycles ? 'var(--text)' : 'transparent', color: n === activeCycles ? 'white' : 'var(--text-2)' }}>
                  C{n}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => onCyclesChange(Math.min(5, activeCycles + 1))}
            className="w-10 h-10 rounded-full bg-[var(--bg-card-2)] text-xl font-bold flex items-center justify-center hover:bg-[var(--border)] active:scale-95 transition-all"
          >+</button>
        </div>
      </div>

      {/* Milestones */}
      <div className="rounded-2xl bg-white border border-[var(--border)] p-4 card-hover">
        <div className="text-sm font-semibold mb-3 text-[var(--text)]">Milestones</div>
        <div className="grid grid-cols-2 gap-2">
          {milestones.map((m) => (
            <div
              key={m.label}
              className="flex items-center gap-2 p-2.5 rounded-xl transition-all"
              style={{ background: m.reached ? 'var(--success-bg)' : 'var(--bg-card-2)' }}
            >
              <div className="text-lg">{m.reached ? '✅' : '⭕'}</div>
              <div>
                <div className="text-xs font-bold" style={{ color: m.reached ? 'var(--success)' : 'var(--text)' }}>{m.label}</div>
                <div className="text-[10px] text-[var(--text-2)]">
                  {m.atCycle === 0 ? 'Already there!' : m.atCycle !== null ? `at C${m.atCycle}` : '>20 cycles'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-2xl bg-white border border-[var(--border)] p-4 card-hover">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="text-sm font-semibold text-[var(--text)]">Portfolio Trajectory</div>
          <div className="flex gap-3 flex-wrap">
            {stocks.map(s => (
              <div key={s.id} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                <span className="text-xs text-[var(--text-2)]">{s.name}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-px bg-[var(--text)]" style={{ borderTop: '2px dashed #1A1A2E' }} />
              <span className="text-xs text-[var(--text-2)]">Total</span>
            </div>
          </div>
        </div>
        <PortfolioChart stocks={stocks} activeCycles={activeCycles} />
      </div>

      {/* Per-stock summary */}
      <div className="grid grid-cols-3 gap-2">
        {projections.map(({ stock, finalShares, valueAtTarget }) => (
          <div key={stock.id} className="rounded-2xl bg-white border border-[var(--border)] p-3 card-hover text-center">
            <div className="w-2 h-2 rounded-full mx-auto mb-1.5" style={{ background: stock.color }} />
            <div className="text-xs font-bold text-[var(--text)] mb-0.5">{stock.name}</div>
            <div className="text-xs font-bold" style={{ color: stock.color }}>${stock.currentPrice.toFixed(2)}</div>
            <div className="text-sm font-bold text-[var(--text)] mt-1">{fmtShares(finalShares)}</div>
            <div className="text-[10px] text-[var(--text-2)]">shares</div>
            <div className="text-xs font-bold mt-1" style={{ color: 'var(--success)' }}>{fmt(valueAtTarget)}</div>
            <div className="text-[10px] text-[var(--text-2)]">at target</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl p-4 bg-white border border-[var(--border)] card-hover">
      <div className="text-xs text-[var(--text-2)] font-medium uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color: accent ? 'var(--success)' : 'var(--text)' }}>{value}</div>
      <div className="text-[11px] text-[var(--text-3)] mt-0.5">{sub}</div>
    </div>
  );
}
