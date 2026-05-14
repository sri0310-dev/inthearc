'use client';
import { useMemo, useState, useRef, useEffect } from 'react';
import { Stock, CycleTarget } from '@/lib/types';
import { computeCycles, computeProjection, computePortfolioValue, fmt, fmtShares, isNearTarget } from '@/lib/compute';

interface Props {
  stocks: Stock[];
  activeCycles: number;
  onCyclesChange: (n: number) => void;
  onCycleUpdate: (stockId: string, cycleIndex: number, field: 'sell' | 'buy' | 'sellQty' | 'chasePercent', value: number) => void;
  onTargetUpdate: (stockId: string, value: number) => void;
  onActiveTrade: (stockId: string, cycleIndex: number, trade: { soldAt: number; soldQty: number } | null) => void;
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
        if (i === 0) return { shares: stock.initialShares, valueAtTarget: stock.initialShares * stock.targetPrice, valueNow: stock.initialShares * stock.currentPrice, gainPct: 0 };
        const proj = computeProjection(stock, i);
        return {
          shares: proj.finalShares,
          valueAtTarget: proj.valueAtTarget,
          valueNow: proj.finalShares * stock.currentPrice,
          gainPct: (proj.finalShares / stock.initialShares - 1) * 100,
        };
      });
      const endGame = stockData.reduce((s, d) => s + d.valueAtTarget, 0);
      const currentVal = stockData.reduce((s, d) => s + d.valueNow, 0);
      return { label, stockData, endGame, currentVal };
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
        <div className="text-xs">
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

      {/* Table only — no chart */}
      <div className="rounded-2xl bg-white border border-[var(--border)] overflow-hidden flex-1 min-h-0">
        <div className="overflow-auto h-full">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--bg-card-2)', borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-3 py-2.5 text-[var(--text-2)] font-semibold sticky left-0 bg-[var(--bg-card-2)]">Cycle</th>
                {stocks.map(s => (
                  <th key={s.id} className="px-2 py-2.5 font-semibold text-center" style={{ color: s.color }}>
                    <div>{s.name}</div>
                    <div className="text-[9px] font-normal text-[var(--text-3)]">sh · @${s.targetPrice}</div>
                  </th>
                ))}
                {/* Current value column */}
                <th className="px-2 py-2.5 text-center font-semibold text-[var(--text-2)]">
                  <div>Portfolio</div>
                  <div className="text-[9px] font-normal text-[var(--text-3)]">live prices</div>
                </th>
                {/* End game column */}
                <th className="px-3 py-2.5 text-right font-semibold" style={{ color: 'var(--success)', whiteSpace: 'nowrap' }}>
                  <div>End Game</div>
                  <div className="text-[9px] font-normal text-[var(--text-3)]">at targets</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const pct = Math.min((row.endGame / 1_000_000) * 100, 100);
                const isHighlight = row.endGame >= 1_000_000;
                return (
                  <tr key={row.label}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: isHighlight ? 'var(--success-bg)' : i === 0 ? 'var(--bg-card-2)' : 'white',
                    }}>
                    {/* Cycle label + progress */}
                    <td className="px-3 py-3 sticky left-0" style={{ background: isHighlight ? 'var(--success-bg)' : i === 0 ? 'var(--bg-card-2)' : 'white' }}>
                      <span className="font-bold" style={{ color: isHighlight ? 'var(--success)' : 'var(--text)' }}>
                        {isHighlight ? '🏆 ' : ''}{row.label}
                      </span>
                      <div className="h-1 rounded-full bg-[var(--border)] mt-1.5 w-14 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: isHighlight ? 'var(--success)' : 'var(--cifr)' }} />
                      </div>
                      <div className="text-[9px] text-[var(--text-3)] mt-0.5">{pct.toFixed(0)}%</div>
                    </td>

                    {/* Per-stock cells */}
                    {row.stockData.map((d, si) => (
                      <td key={si} className="px-2 py-3 text-center">
                        <div className="font-bold text-[var(--text)]">{fmtShares(d.shares)}</div>
                        {/* Live price value */}
                        <div className="text-[10px] text-[var(--text-2)]">{fmt(d.valueNow)}</div>
                        {/* Target price value */}
                        <div className="text-[10px]" style={{ color: 'var(--success)' }}>{fmt(d.valueAtTarget)}</div>
                        {i > 0 && d.gainPct > 0 && (
                          <div className="text-[9px]" style={{ color: stocks[si].color }}>+{d.gainPct.toFixed(1)}%</div>
                        )}
                      </td>
                    ))}

                    {/* Current portfolio value (live prices) */}
                    <td className="px-2 py-3 text-center">
                      <div className="font-bold text-[var(--text)]">{fmt(row.currentVal)}</div>
                      {i > 0 && (
                        <div className="text-[9px]" style={{ color: 'var(--text-3)' }}>
                          +{fmt(row.currentVal - rows[0].currentVal)}
                        </div>
                      )}
                    </td>

                    {/* End game column */}
                    <td className="px-3 py-3 text-right">
                      <div className="font-bold" style={{ color: isHighlight ? 'var(--success)' : 'var(--text)', fontSize: 13 }}>
                        {fmt(row.endGame)}
                      </div>
                      {isHighlight && (
                        <div className="text-[9px] font-bold" style={{ color: 'var(--success)' }}>$1M ✓</div>
                      )}
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
function MarkSoldForm({ result, cycle, stock, onConfirm, onCancel }: {
  result: import('@/lib/types').CycleResult;
  cycle: CycleTarget;
  stock: Stock;
  onConfirm: (soldAt: number, soldQty: number) => void;
  onCancel: () => void;
}) {
  const [soldAt, setSoldAt] = useState(cycle.sell.toFixed(2));
  const [soldQty, setSoldQty] = useState(String(result.tradeQty));

  const qty = parseFloat(soldQty);
  const price = parseFloat(soldAt);
  const cashRaised = !isNaN(qty) && !isNaN(price) ? qty * price : 0;

  return (
    <div className="rounded-xl border-2 p-3 mt-2" style={{ borderColor: 'var(--warning)', background: '#FFFBEB' }}>
      <div className="text-xs font-bold text-amber-700 mb-2">🔴 Log executed sell</div>
      <div className="flex gap-2 mb-2">
        <div className="flex-1">
          <div className="text-[10px] text-[var(--text-2)] mb-1">Sold price</div>
          <div className="flex items-center gap-1 bg-white border border-[var(--border)] rounded-lg px-2 py-1.5">
            <span className="text-xs text-[var(--text-2)]">$</span>
            <input type="number" value={soldAt} onChange={e => setSoldAt(e.target.value)}
              className="flex-1 text-sm font-bold bg-transparent focus:outline-none" inputMode="decimal" />
          </div>
        </div>
        <div className="flex-1">
          <div className="text-[10px] text-[var(--text-2)] mb-1">Qty sold</div>
          <input type="number" value={soldQty} onChange={e => setSoldQty(e.target.value)}
            className="w-full px-2 py-1.5 text-sm font-bold bg-white border border-[var(--border)] rounded-lg focus:outline-none text-center" inputMode="numeric" />
        </div>
      </div>
      {cashRaised > 0 && (
        <div className="text-[10px] text-amber-700 mb-2">
          Cash raised: <span className="font-bold">{fmt(cashRaised)}</span>
          {' · '}Will buy <span className="font-bold">~{fmtShares(cashRaised / cycle.buy)}</span> sh at ${cycle.buy.toFixed(2)}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => onConfirm(parseFloat(soldAt), parseFloat(soldQty))}
          className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white"
          style={{ background: 'var(--warning)' }}>
          Confirm Sold
        </button>
        <button onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--text-2)] bg-[var(--bg-card-2)]">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ActiveTradePanel({ stock, cycleIndex, cycle, result, currentPrice, onClear, onBuyUpdate }: {
  stock: Stock;
  cycleIndex: number;
  cycle: CycleTarget;
  result: import('@/lib/types').CycleResult;
  currentPrice: number;
  onClear: () => void;
  onBuyUpdate: (v: number) => void;
}) {
  const trade = cycle.activeTrade!;
  const cashRaised = trade.soldAt * trade.soldQty;
  const coreQty = result.sharesBefore - trade.soldQty;
  const sharesOnGTC = cashRaised / cycle.buy;
  const totalOnGTC = coreQty + sharesOnGTC;
  const gainShares = totalOnGTC - result.sharesBefore;
  const gainPct = (totalOnGTC / result.sharesBefore - 1) * 100;

  const distToBuy = ((currentPrice - cycle.buy) / cycle.buy) * 100;
  const nearBuy = Math.abs(distToBuy) < 3;
  const aboveSell = currentPrice > trade.soldAt;

  return (
    <div className="rounded-xl overflow-hidden border-2 mt-2" style={{ borderColor: stock.color }}>
      {/* Active banner */}
      <div className="px-3 py-2 flex items-center justify-between" style={{ background: stock.color }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse-dot" />
          <span className="text-xs font-bold text-white">C{cycleIndex + 1} ACTIVE — waiting for GTC</span>
        </div>
        <button onClick={onClear} className="text-[10px] text-white/70 hover:text-white">✕ Clear</button>
      </div>

      <div className="p-3 space-y-2" style={{ background: stock.color + '08' }}>
        {/* Sold row — frozen */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[var(--border)]">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">SOLD 🔒</span>
            <span className="text-xs text-[var(--text-2)]">{fmtShares(trade.soldQty)} sh</span>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-[var(--text)]">${trade.soldAt.toFixed(2)}</div>
            <div className="text-[10px] text-[var(--text-2)]">{fmt(cashRaised)} raised</div>
          </div>
        </div>

        {/* Current price vs sold */}
        <div className="flex items-center gap-2 px-1">
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span className="text-[10px] font-medium" style={{ color: aboveSell ? 'var(--success)' : 'var(--text-2)' }}>
            live ${currentPrice.toFixed(2)} {aboveSell ? '↑ still running' : '↓ pulling back'}
          </span>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

        {/* GTC buy — editable */}
        <div className={`rounded-xl p-2.5 border ${nearBuy ? 'border-green-400 bg-green-50' : 'border-[var(--border)] bg-white'}`}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                {nearBuy ? '🎯 GTC NEAR!' : 'GTC BUY'}
              </span>
              <span className="text-[10px] text-[var(--text-2)]">{distToBuy >= 0 ? '+' : ''}{distToBuy.toFixed(1)}% from live</span>
            </div>
            <span className="text-[10px] font-medium" style={{ color: 'var(--success)' }}>
              ~{fmtShares(sharesOnGTC)} sh · core {fmtShares(coreQty)} untouched
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[var(--text-2)]">$</span>
              <input type="number" value={cycle.buy.toFixed(2)} step={0.5}
                onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) onBuyUpdate(v); }}
                className="w-full pl-5 pr-2 py-2 text-sm font-bold bg-white border border-green-300 rounded-lg focus:outline-none"
                inputMode="decimal" />
            </div>
          </div>
          <input type="range" min={currentPrice * 0.5} max={trade.soldAt * 0.99} step={0.5}
            value={Math.min(Math.max(cycle.buy, currentPrice * 0.5), trade.soldAt * 0.99)}
            onChange={e => onBuyUpdate(parseFloat(e.target.value))}
            className="w-full mt-2" style={{ accentColor: stock.color }} />
        </div>

        {/* Outcome summary */}
        <div className="flex items-center justify-between px-1 pt-1">
          <div>
            <div className="text-[10px] text-[var(--text-2)]">If GTC fires</div>
            <div className="text-sm font-bold" style={{ color: 'var(--success)' }}>
              {fmtShares(result.sharesBefore)} → {fmtShares(totalOnGTC)} sh
            </div>
            <div className="text-[10px]" style={{ color: stock.color }}>+{fmtShares(gainShares)} sh (+{gainPct.toFixed(1)}%)</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-[var(--text-2)]">at ${stock.targetPrice} target</div>
            <div className="text-sm font-bold" style={{ color: 'var(--success)' }}>{fmt(totalOnGTC * stock.targetPrice)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StockView({ stock, activeCycles, onCycleUpdate, onTargetUpdate, onActiveTrade }: {
  stock: Stock; activeCycles: number;
  onCycleUpdate: (cycleIndex: number, field: 'sell' | 'buy' | 'sellQty' | 'chasePercent', value: number) => void;
  onTargetUpdate: (value: number) => void;
  onActiveTrade: (cycleIndex: number, trade: { soldAt: number; soldQty: number } | null) => void;
}) {
  const [showSoldFormFor, setShowSoldFormFor] = useState<number | null>(null);

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
          const isPartial = result.isPartial;
          const chaseGainPct = result.valid ? (result.sharesAfterChase / result.sharesBefore - 1) * 100 : 0;

          return (
            <div key={i} className={`rounded-xl p-3 ${sectionClass}`}>
              {/* Cycle header row */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: stock.color + '22', color: stock.color }}>C{i + 1}</span>
                  {nearSell && !cycle.activeTrade && <span className="text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">NEAR SELL</span>}
                  {nearBuy && !cycle.activeTrade && <span className="text-[9px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">NEAR BUY</span>}
                </div>
                <div className="flex items-center gap-2">
                  {result.valid && !cycle.activeTrade && (
                    <span className="text-xs font-bold" style={{ color: 'var(--success)' }}>
                      {fmtShares(result.sharesBefore)} → {fmtShares(result.sharesAfter)}&nbsp;
                      <span style={{ color: stock.color }}>+{result.gainPct.toFixed(1)}%</span>
                    </span>
                  )}
                  {!result.valid && <span className="text-[10px] text-[var(--danger)]">Buy must be &lt; Sell</span>}
                  {/* Mark sold toggle */}
                  {result.valid && !cycle.activeTrade && showSoldFormFor !== i && (
                    <button onClick={() => setShowSoldFormFor(i)}
                      className="text-[9px] font-bold px-2 py-1 rounded-full border transition-all"
                      style={{ borderColor: 'var(--warning)', color: 'var(--warning)', background: 'transparent' }}>
                      Mark Sold
                    </button>
                  )}
                </div>
              </div>

              {/* Qty to sell row */}
              <div className="flex items-center gap-2 mb-2 px-0.5">
                <span className="text-[10px] font-bold text-[var(--text-2)] uppercase w-8">QTY</span>
                <div className="flex items-center gap-1.5 flex-1">
                  <input
                    type="number"
                    value={result.tradeQty}
                    min={1}
                    max={result.sharesBefore}
                    step={1}
                    onChange={(e) => {
                      const v = Math.round(parseFloat(e.target.value));
                      if (!isNaN(v) && v >= 1 && v <= result.sharesBefore) onCycleUpdate(i, 'sellQty', v);
                    }}
                    className="w-20 px-2 py-1.5 text-sm font-bold bg-white border border-[var(--border)] rounded-lg focus:outline-none text-center"
                    inputMode="numeric"
                  />
                  <span className="text-[10px] text-[var(--text-2)]">of {fmtShares(result.sharesBefore)} shares</span>
                  {isPartial && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto"
                      style={{ background: stock.color + '22', color: stock.color }}>
                      {Math.round((result.tradeQty / result.sharesBefore) * 100)}% swing
                    </span>
                  )}
                  {!isPartial && (
                    <span className="text-[9px] text-[var(--text-3)] ml-auto">full position</span>
                  )}
                </div>
              </div>

              {/* Sell form / active trade panel / normal controls */}
              {showSoldFormFor === i && !cycle.activeTrade ? (
                <MarkSoldForm
                  result={result} cycle={cycle} stock={stock}
                  onConfirm={(soldAt, soldQty) => {
                    if (!isNaN(soldAt) && !isNaN(soldQty) && soldAt > 0 && soldQty > 0) {
                      onActiveTrade(i, { soldAt, soldQty });
                    }
                    setShowSoldFormFor(null);
                  }}
                  onCancel={() => setShowSoldFormFor(null)}
                />
              ) : cycle.activeTrade ? (
                <ActiveTradePanel
                  stock={stock} cycleIndex={i} cycle={cycle} result={result}
                  currentPrice={stock.currentPrice}
                  onClear={() => onActiveTrade(i, null)}
                  onBuyUpdate={(v) => onCycleUpdate(i, 'buy', v)}
                />
              ) : (
                <>
                  <PriceControl label="SELL" arrow="↑" arrowColor="var(--warning)"
                    value={cycle.sell} min={sellMin} max={sellMax} step={0.5} color={stock.color}
                    invalid={!result.valid} onChange={(v) => onCycleUpdate(i, 'sell', v)} currentPrice={stock.currentPrice} />
                  <PriceControl label="BUY" arrow="↓" arrowColor="var(--success)"
                    value={cycle.buy} min={buyMin} max={buyMax} step={0.5} color={stock.color}
                    invalid={!result.valid} onChange={(v) => onCycleUpdate(i, 'buy', v)} currentPrice={stock.currentPrice} />
                </>
              )}

              {/* Scenario outcomes — always visible, extra prominent for partial */}
              {result.valid && (
                <div className="mt-2 rounded-lg overflow-hidden border border-[var(--border)]">
                  {/* Core held */}
                  {isPartial && (
                    <div className="px-2.5 py-1.5 flex items-center justify-between text-[10px]"
                      style={{ background: 'var(--bg-card-2)', borderBottom: '1px solid var(--border)' }}>
                      <span className="text-[var(--text-2)]">Core held throughout</span>
                      <span className="font-bold text-[var(--text)]">{fmtShares(result.coreQty)} sh · {fmt(result.coreQty * stock.currentPrice)}</span>
                    </div>
                  )}
                  {/* Optimal: GTC fires */}
                  <div className="px-2.5 py-1.5 flex items-center justify-between text-[10px]"
                    style={{ background: '#F0FDF4', borderBottom: isPartial ? '1px solid var(--border)' : undefined }}>
                    <span className="font-bold text-green-700">✓ GTC fires at ${result.buy.toFixed(2)}</span>
                    <span className="font-bold text-green-700">
                      {fmtShares(result.sharesBefore)} → {fmtShares(result.sharesAfter)} sh&nbsp;
                      (+{result.gainPct.toFixed(1)}%)
                    </span>
                  </div>
                  {/* Chase scenario */}
                  {isPartial && (
                    <div className="px-2.5 py-1.5 flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-red-600 font-bold">✗ Chase at ${result.chasePrice.toFixed(2)}</span>
                        <span className="text-[var(--text-3)]">(+{cycle.chasePercent ?? 12}%)</span>
                        <button
                          className="text-[8px] text-[var(--text-3)] underline"
                          onClick={() => {
                            const cur = cycle.chasePercent ?? 12;
                            const next = cur === 8 ? 10 : cur === 10 ? 12 : cur === 12 ? 15 : cur === 15 ? 20 : 8;
                            onCycleUpdate(i, 'chasePercent', next);
                          }}
                        >edit</button>
                      </div>
                      <span className="font-bold" style={{ color: chaseGainPct >= 0 ? 'var(--text-2)' : 'var(--danger)' }}>
                        {fmtShares(result.sharesBefore)} → {fmtShares(result.sharesAfterChase)} sh&nbsp;
                        ({chaseGainPct >= 0 ? '+' : ''}{chaseGainPct.toFixed(1)}%)
                      </span>
                    </div>
                  )}
                </div>
              )}
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
export default function StrategyTab({ stocks, activeCycles, onCyclesChange, onCycleUpdate, onTargetUpdate, onActiveTrade }: Props) {
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
            onActiveTrade={(cycleIndex, trade) => onActiveTrade(activeStock.id, cycleIndex, trade)}
          />
        ) : null}
      </div>
    </div>
  );
}
