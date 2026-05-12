'use client';
import { useMemo, useState, useRef, useEffect } from 'react';
import { Stock, CycleTarget } from '@/lib/types';
import { computeCycles, computeProjection, computePortfolioValue, fmt, fmtShares, isNearTarget } from '@/lib/compute';

interface Props {
  stocks: Stock[];
  activeCycles: number;
  onCyclesChange: (n: number) => void;
  onCycleUpdate: (stockId: string, cycleIndex: number, field: 'sell' | 'buy', value: number) => void;
  onTargetUpdate: (stockId: string, value: number) => void;
}

// ─── Blended chart ───────────────────────────────────────────────────────────
function BlendedChart({ stocks, activeCycles }: { stocks: Stock[]; activeCycles: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<unknown>(null);

  useEffect(() => {
    let mounted = true;
    async function init() {
      const { Chart, registerables } = await import('chart.js');
      Chart.register(...registerables);
      if (!mounted || !canvasRef.current) return;
      if (chartRef.current) (chartRef.current as import('chart.js').Chart).destroy();

      const maxCycles = 5;
      const labels = ['Now', ...Array.from({ length: maxCycles }, (_, i) => `C${i + 1}`)];

      // Total portfolio value line
      const totalData = labels.map((_, i) =>
        i === 0
          ? stocks.reduce((s, st) => s + st.initialShares * st.targetPrice, 0)
          : computePortfolioValue(stocks, i)
      );

      // Per-stock value lines
      const stockDatasets = stocks.map((stock) => ({
        label: stock.name,
        borderColor: stock.color,
        backgroundColor: 'transparent',
        data: labels.map((_, i) => {
          if (i === 0) return stock.initialShares * stock.targetPrice;
          const proj = computeProjection(stock, i);
          return proj.valueAtTarget;
        }),
        tension: 0.45,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 6,
        borderDash: [],
      }));

      // Per-stock share count (secondary dataset, on right axis)
      const shareDatasets = stocks.map((stock) => ({
        label: `${stock.name} shares`,
        borderColor: stock.color + '55',
        backgroundColor: 'transparent',
        data: labels.map((_, i) => {
          if (i === 0) return stock.initialShares;
          const proj = computeProjection(stock, i);
          return proj.finalShares;
        }),
        tension: 0.45,
        borderWidth: 1.5,
        pointRadius: 2,
        borderDash: [4, 3],
        yAxisID: 'yShares',
        hidden: false,
      }));

      chartRef.current = new Chart(canvasRef.current!, {
        type: 'line',
        data: {
          labels: labels.slice(0, activeCycles + 1),
          datasets: [
            // $1M reference
            {
              label: '$1M target',
              borderColor: '#DC2626',
              backgroundColor: 'transparent',
              data: Array(activeCycles + 1).fill(1_000_000),
              borderDash: [6, 4],
              borderWidth: 1.5,
              pointRadius: 0,
              tension: 0,
            },
            // Total portfolio
            {
              label: 'Total portfolio',
              borderColor: '#1A1A2E',
              backgroundColor: '#1A1A2E08',
              data: totalData.slice(0, activeCycles + 1),
              tension: 0.45,
              borderWidth: 2.5,
              pointRadius: 4,
              pointHoverRadius: 7,
              fill: true,
            },
            // Per-stock values
            ...stockDatasets.map(d => ({ ...d, data: d.data.slice(0, activeCycles + 1) })),
            // Per-stock share counts (right axis)
            ...shareDatasets.map(d => ({ ...d, data: d.data.slice(0, activeCycles + 1) })),
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  if (ctx.dataset.yAxisID === 'yShares') {
                    return ` ${ctx.dataset.label}: ${fmtShares(ctx.raw as number)} sh`;
                  }
                  return ` ${ctx.dataset.label}: ${fmt(ctx.raw as number)}`;
                },
              },
            },
          },
          scales: {
            x: {
              grid: { color: '#E8E4DC' },
              ticks: { color: '#6B6B80', font: { size: 11 } },
            },
            y: {
              position: 'left',
              grid: { color: '#E8E4DC' },
              ticks: { color: '#6B6B80', font: { size: 10 }, callback: (v) => fmt(v as number) },
            },
            yShares: {
              position: 'right',
              grid: { drawOnChartArea: false },
              ticks: { color: '#9B9BAD', font: { size: 9 }, callback: (v) => fmtShares(v as number) },
            },
          },
        },
      });
    }
    init();
    return () => { mounted = false; if (chartRef.current) (chartRef.current as import('chart.js').Chart).destroy(); };
  }, [stocks, activeCycles]);

  return <canvas ref={canvasRef} />;
}

// ─── Blended tab content ─────────────────────────────────────────────────────
function BlendedView({ stocks, activeCycles, onCyclesChange }: { stocks: Stock[]; activeCycles: number; onCyclesChange: (n: number) => void }) {
  const labels = ['Now', ...Array.from({ length: activeCycles }, (_, i) => `C${i + 1}`)];

  const rows = useMemo(() =>
    labels.map((label, i) => {
      const stockData = stocks.map((stock) => {
        if (i === 0) return { shares: stock.initialShares, value: stock.initialShares * stock.targetPrice, gainPct: 0 };
        const proj = computeProjection(stock, i);
        return {
          shares: proj.finalShares,
          value: proj.valueAtTarget,
          gainPct: (proj.finalShares / stock.initialShares - 1) * 100,
        };
      });
      const total = stockData.reduce((s, d) => s + d.value, 0);
      return { label, stockData, total };
    }), [stocks, activeCycles, labels]);

  const cyclesToMillion = useMemo(() => {
    for (let n = 1; n <= 20; n++) {
      if (computePortfolioValue(stocks, n) >= 1_000_000) return n;
    }
    return null;
  }, [stocks]);

  return (
    <div className="flex flex-col h-full">
      {/* Cycles control */}
      <div className="flex items-center justify-between px-1 mb-3 flex-shrink-0">
        <div className="text-xs text-[var(--text-2)]">
          {cyclesToMillion !== null
            ? <span style={{ color: 'var(--success)', fontWeight: 700 }}>✓ $1M at C{cyclesToMillion}</span>
            : <span className="text-[var(--text-2)]">&gt;20 cycles to $1M</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-2)]">Cycles:</span>
          <div className="flex gap-1">
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => onCyclesChange(n)}
                className="w-7 h-7 rounded-full text-xs font-bold transition-all"
                style={{ background: n === activeCycles ? 'var(--text)' : 'var(--bg-card-2)', color: n === activeCycles ? 'white' : 'var(--text-2)' }}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-2xl bg-white border border-[var(--border)] p-3 mb-3 flex-shrink-0">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <span className="text-xs font-semibold text-[var(--text)]">Portfolio divergence to $1M</span>
          {stocks.map(s => (
            <div key={s.id} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
              <span className="text-[10px] text-[var(--text-2)]">{s.name}</span>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <div className="w-4 border-t-2 border-dashed border-[#1A1A2E]" />
            <span className="text-[10px] text-[var(--text-2)]">Total</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 border-t border-dashed border-red-500" />
            <span className="text-[10px] text-[var(--text-2)]">$1M</span>
          </div>
        </div>
        <div style={{ height: 200 }}>
          <BlendedChart stocks={stocks} activeCycles={activeCycles} />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white border border-[var(--border)] overflow-hidden flex-1 min-h-0">
        <div className="overflow-auto h-full">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--bg-card-2)', borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-3 py-2.5 text-[var(--text-2)] font-semibold">Cycle</th>
                {stocks.map(s => (
                  <th key={s.id} className="px-2 py-2.5 font-semibold" style={{ color: s.color }}>
                    <div>{s.name}</div>
                    <div className="text-[9px] font-normal text-[var(--text-3)]">sh · @${s.targetPrice}</div>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-semibold text-[var(--text)]">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const pct = Math.min((row.total / 1_000_000) * 100, 100);
                const isHighlight = row.total >= 1_000_000;
                return (
                  <tr key={row.label}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: isHighlight ? 'var(--success-bg)' : i === 0 ? 'var(--bg-card-2)' : 'white',
                    }}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold" style={{ color: isHighlight ? 'var(--success)' : 'var(--text)' }}>
                          {isHighlight ? '🏆' : ''}{row.label}
                        </span>
                      </div>
                      {/* Mini progress bar */}
                      <div className="h-1 rounded-full bg-[var(--border)] mt-1 w-16 overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: isHighlight ? 'var(--success)' : 'var(--cifr)' }} />
                      </div>
                      <div className="text-[9px] text-[var(--text-3)] mt-0.5">{pct.toFixed(0)}%</div>
                    </td>
                    {row.stockData.map((d, si) => (
                      <td key={si} className="px-2 py-2.5 text-center">
                        <div className="font-bold text-[var(--text)]">{fmtShares(d.shares)}</div>
                        <div className="text-[10px]" style={{ color: 'var(--success)' }}>{fmt(d.value)}</div>
                        {i > 0 && d.gainPct > 0 && (
                          <div className="text-[9px]" style={{ color: stocks[si].color }}>+{d.gainPct.toFixed(1)}%</div>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right">
                      <div className="font-bold" style={{ color: isHighlight ? 'var(--success)' : 'var(--text)', fontSize: 13 }}>
                        {fmt(row.total)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Price control ────────────────────────────────────────────────────────────
function PriceControl({ label, arrow, arrowColor, value, min, max, step, color, invalid, onChange, currentPrice }: {
  label: string; arrow: string; arrowColor: string;
  value: number; min: number; max: number; step: number;
  color: string; invalid: boolean; onChange: (v: number) => void; currentPrice: number;
}) {
  const pct = ((value - currentPrice) / currentPrice * 100);
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-bold text-[var(--text-2)] uppercase w-8">{label}</span>
        <span className="text-sm font-bold" style={{ color: arrowColor }}>{arrow}</span>
        <div className="flex-1 flex items-center gap-2">
          <div className={`relative flex-1 ${invalid ? 'ring-1 ring-red-400' : ''} rounded-lg overflow-hidden`}>
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[var(--text-2)]">$</span>
            <input
              type="number"
              value={value.toFixed(2)}
              step={step}
              onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) onChange(v); }}
              className="w-full pl-5 pr-2 py-2 text-sm font-bold bg-white border border-[var(--border)] rounded-lg focus:outline-none"
              style={{ borderColor: invalid ? 'var(--danger)' : undefined }}
              inputMode="decimal"
            />
          </div>
          <span className="text-[10px] font-medium min-w-[40px] text-right" style={{ color: pct >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {pct >= 0 ? '+' : ''}{pct.toFixed(0)}%
          </span>
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={Math.min(Math.max(value, min), max)}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1" style={{ accentColor: color }}
      />
    </div>
  );
}

// ─── Single stock view ───────────────────────────────────────────────────────
function StockView({ stock, activeCycles, onCycleUpdate, onTargetUpdate }: {
  stock: Stock; activeCycles: number;
  onCycleUpdate: (cycleIndex: number, field: 'sell' | 'buy', value: number) => void;
  onTargetUpdate: (value: number) => void;
}) {
  const cycleResults = useMemo(
    () => computeCycles(stock.initialShares, stock.cycles, activeCycles),
    [stock.initialShares, stock.cycles, activeCycles]
  );
  const finalResult = cycleResults[cycleResults.length - 1];

  return (
    <div className="flex flex-col h-full">
      {/* Stock header */}
      <div className="rounded-2xl bg-white border border-[var(--border)] p-3 mb-3 flex-shrink-0"
        style={{ borderLeft: `4px solid ${stock.color}` }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-[var(--text-2)]">{fmtShares(stock.initialShares)} shares @ ${stock.currentPrice.toFixed(2)}</div>
            <div className="text-sm font-bold text-[var(--text)]">{fmt(stock.initialShares * stock.currentPrice)} current</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-[var(--text-2)] mb-0.5">Price target</div>
            <div className="flex items-center gap-1">
              <span className="text-sm text-[var(--text-2)]">$</span>
              <input
                type="number"
                value={stock.targetPrice}
                onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) onTargetUpdate(v); }}
                className="text-base font-bold text-right bg-transparent focus:outline-none w-20 border-b border-dashed border-[var(--border)]"
                style={{ color: stock.color }}
                inputMode="decimal"
              />
            </div>
          </div>
        </div>
        {/* Share gain summary */}
        {finalResult && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-[var(--bg-card-2)] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min((finalResult.sharesAfter / (stock.initialShares * 3)) * 100, 100)}%`, background: stock.color }} />
            </div>
            <span className="text-xs font-bold" style={{ color: stock.color }}>
              {fmtShares(stock.initialShares)} → {fmtShares(finalResult.sharesAfter)} shares
            </span>
          </div>
        )}
      </div>

      {/* Cycles — scrollable */}
      <div className="flex-1 overflow-y-auto space-y-2 pb-2">
        {cycleResults.map((result, i) => {
          const nearSell = isNearTarget(stock.currentPrice, stock.cycles[i]?.sell ?? result.sell);
          const nearBuy = isNearTarget(stock.currentPrice, stock.cycles[i]?.buy ?? result.buy);
          const sectionClass = nearSell ? 'cycle-near-sell' : nearBuy ? 'cycle-near-buy' : 'bg-[var(--bg-card-2)]';
          const cycle = stock.cycles[i] ?? { sell: result.sell, buy: result.buy };
          const sellMin = stock.currentPrice * 0.8;
          const sellMax = stock.targetPrice * 1.15;
          const buyMin = stock.currentPrice * 0.5;
          const buyMax = cycle.sell * 0.99;

          return (
            <div key={i} className={`rounded-xl p-3 ${sectionClass}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: stock.color + '22', color: stock.color }}>C{i + 1}</span>
                  {nearSell && <span className="text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">NEAR SELL</span>}
                  {nearBuy && <span className="text-[9px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">NEAR BUY</span>}
                </div>
                {result.valid ? (
                  <span className="text-xs font-bold" style={{ color: 'var(--success)' }}>
                    {fmtShares(result.sharesBefore)} → {fmtShares(result.sharesAfter)}&nbsp;
                    <span style={{ color: stock.color }}>+{result.gainPct.toFixed(1)}%</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-[var(--danger)]">Buy must be &lt; Sell</span>
                )}
              </div>
              <PriceControl label="SELL" arrow="↑" arrowColor="var(--warning)"
                value={cycle.sell} min={sellMin} max={sellMax} step={0.5} color={stock.color}
                invalid={!result.valid} onChange={(v) => onCycleUpdate(i, 'sell', v)} currentPrice={stock.currentPrice} />
              <PriceControl label="BUY" arrow="↓" arrowColor="var(--success)"
                value={cycle.buy} min={buyMin} max={buyMax} step={0.5} color={stock.color}
                invalid={!result.valid} onChange={(v) => onCycleUpdate(i, 'buy', v)} currentPrice={stock.currentPrice} />
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {finalResult && (
        <div className="rounded-2xl border p-3 mt-2 flex items-center justify-between flex-shrink-0"
          style={{ background: stock.color + '0D', borderColor: stock.color + '33' }}>
          <div>
            <div className="text-[10px] text-[var(--text-2)]">After {activeCycles} cycles</div>
            <div className="text-lg font-bold text-[var(--text)]">{fmtShares(finalResult.sharesAfter)} shares</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-[var(--text-2)]">at ${stock.targetPrice} target</div>
            <div className="text-lg font-bold" style={{ color: 'var(--success)' }}>{fmt(finalResult.sharesAfter * stock.targetPrice)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main StrategyTab ─────────────────────────────────────────────────────────
export default function StrategyTab({ stocks, activeCycles, onCyclesChange, onCycleUpdate, onTargetUpdate }: Props) {
  const stockTabs = stocks.map(s => ({ id: s.id, label: s.name, color: s.color }));
  const allTabs = [...stockTabs, { id: 'blended', label: 'Blended', color: '#1A1A2E' }];
  const [activeStockId, setActiveStockId] = useState(stocks[0]?.id ?? 'blended');

  const activeStock = stocks.find(s => s.id === activeStockId);

  return (
    <div className="animate-slide-up flex flex-col" style={{ height: 'calc(100dvh - 160px)' }}>
      {/* Stock tabs + cycle selector */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        {/* Stock selector tabs */}
        <div className="flex gap-1.5 p-1 rounded-2xl bg-[var(--bg-card-2)]">
          {allTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveStockId(tab.id)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{
                background: activeStockId === tab.id ? (tab.id === 'blended' ? '#1A1A2E' : tab.color) : 'transparent',
                color: activeStockId === tab.id ? 'white' : 'var(--text-2)',
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Cycles (only for stock tabs) */}
        {activeStockId !== 'blended' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--text-2)]">Cycles</span>
            <div className="flex gap-1">
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => onCyclesChange(n)}
                  className="w-6 h-6 rounded-full text-[10px] font-bold transition-all"
                  style={{ background: n === activeCycles ? 'var(--text)' : 'var(--bg-card-2)', color: n === activeCycles ? 'white' : 'var(--text-2)' }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeStockId === 'blended' ? (
          <BlendedView stocks={stocks} activeCycles={activeCycles} onCyclesChange={onCyclesChange} />
        ) : activeStock ? (
          <StockView
            stock={activeStock}
            activeCycles={activeCycles}
            onCycleUpdate={(cycleIndex, field, value) => onCycleUpdate(activeStock.id, cycleIndex, field, value)}
            onTargetUpdate={(value) => onTargetUpdate(activeStock.id, value)}
          />
        ) : null}
      </div>
    </div>
  );
}
