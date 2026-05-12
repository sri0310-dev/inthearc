'use client';
import { useMemo } from 'react';
import { Stock } from '@/lib/types';
import { computeProjection, fmt, fmtShares } from '@/lib/compute';

interface Props {
  stocks: Stock[];
  activeCycles: number;
}

function StockJourney({ stock, activeCycles }: { stock: Stock; activeCycles: number }) {
  const proj = useMemo(() => computeProjection(stock, activeCycles), [stock, activeCycles]);

  const nodes = useMemo(() => {
    const items = [
      {
        label: 'Now',
        shares: stock.initialShares,
        value: stock.initialShares * stock.targetPrice,
        gainPct: 0,
        isNow: true,
      },
      ...proj.cycleResults.map((r, i) => ({
        label: `C${i + 1}`,
        shares: r.sharesAfter,
        value: r.sharesAfter * stock.targetPrice,
        gainPct: r.gainPct,
        isNow: false,
      })),
    ];
    return items;
  }, [stock, proj]);

  const maxShares = nodes[nodes.length - 1].shares;

  return (
    <div className="rounded-2xl bg-white border border-[var(--border)] overflow-hidden mb-4 card-hover">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--border)]" style={{ borderLeft: `4px solid ${stock.color}` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: stock.color }} />
            <span className="font-bold text-[var(--text)]">{stock.name}</span>
          </div>
          <div className="text-right">
            <div className="text-xs text-[var(--text-2)]">target ${stock.targetPrice}</div>
            <div className="text-sm font-bold" style={{ color: stock.color }}>
              {fmtShares(stock.initialShares)} → {fmtShares(proj.finalShares)} shares
            </div>
          </div>
        </div>
      </div>

      {/* Node timeline */}
      <div className="p-4">
        <div className="node-row pb-2">
          <div className="flex items-start gap-0" style={{ minWidth: `${nodes.length * 110}px` }}>
            {nodes.map((node, i) => (
              <div key={i} className="flex items-start">
                {/* Node */}
                <div className="flex flex-col items-center" style={{ width: 90 }}>
                  {/* Circle */}
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all"
                    style={
                      node.isNow
                        ? { background: 'var(--bg-card-2)', borderColor: 'var(--border)', color: 'var(--text-2)' }
                        : { background: stock.color + '22', borderColor: stock.color, color: stock.color }
                    }
                  >
                    {node.label}
                  </div>
                  {/* Shares */}
                  <div className="text-center mt-1.5">
                    <div className="text-sm font-bold text-[var(--text)]">{fmtShares(node.shares)}</div>
                    <div className="text-[10px] text-[var(--text-2)]">shares</div>
                    <div className="text-xs font-bold mt-0.5" style={{ color: 'var(--success)' }}>{fmt(node.value)}</div>
                    {!node.isNow && node.gainPct > 0 && (
                      <div className="text-[10px] font-bold mt-0.5" style={{ color: stock.color }}>
                        +{node.gainPct.toFixed(1)}%
                      </div>
                    )}
                  </div>
                </div>

                {/* Arrow connector */}
                {i < nodes.length - 1 && (
                  <div className="flex items-center" style={{ width: 20, paddingTop: 20 }}>
                    <div className="w-full flex items-center">
                      <div className="flex-1 h-px" style={{ background: stock.color + '66' }} />
                      <span style={{ color: stock.color, fontSize: 10 }}>›</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Accumulation bars */}
        <div className="mt-4 space-y-1.5">
          <div className="text-xs font-semibold text-[var(--text-2)] mb-2">Share accumulation</div>
          {nodes.map((node, i) => {
            const barPct = (node.shares / maxShares) * 100;
            return (
              <div key={i} className="flex items-center gap-2">
                <div className="text-[11px] font-medium text-[var(--text-2)] w-8 text-right">{node.label}</div>
                <div className="flex-1 h-5 bg-[var(--bg-card-2)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                    style={{
                      width: `${barPct}%`,
                      background: node.isNow ? 'var(--border)' : stock.color,
                      minWidth: barPct > 5 ? undefined : '24px',
                    }}
                  >
                  </div>
                </div>
                <div className="text-[11px] font-bold text-[var(--text)] w-14 text-right">{fmtShares(node.shares)}</div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="mt-4 p-3 rounded-xl" style={{ background: stock.color + '11', border: `1px solid ${stock.color}33` }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-[var(--text-2)]">After {activeCycles} cycles</div>
              <div className="text-xl font-bold" style={{ color: stock.color }}>
                +{fmtShares(proj.finalShares - stock.initialShares)} shares
              </div>
              <div className="text-xs text-[var(--text-2)]">
                {((proj.finalShares / stock.initialShares - 1) * 100).toFixed(1)}% more shares
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[var(--text-2)]">value at ${stock.targetPrice}</div>
              <div className="text-xl font-bold" style={{ color: 'var(--success)' }}>{fmt(proj.valueAtTarget)}</div>
              <div className="text-xs text-[var(--text-2)]">vs {fmt(stock.initialShares * stock.targetPrice)} hold</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function JourneyTab({ stocks, activeCycles }: Props) {
  const totalInitialAtTarget = useMemo(
    () => stocks.reduce((s, st) => s + st.initialShares * st.targetPrice, 0),
    [stocks]
  );
  const totalProjected = useMemo(
    () => stocks.reduce((s, st) => {
      const p = computeProjection(st, activeCycles);
      return s + p.valueAtTarget;
    }, 0),
    [stocks, activeCycles]
  );

  return (
    <div className="animate-slide-up pb-6">
      {/* Explainer */}
      <div className="rounded-2xl bg-[var(--info-bg)] border border-[var(--cifr)]22 p-4 mb-4">
        <div className="text-sm font-bold text-[var(--info)] mb-1">How the swing accumulation works</div>
        <p className="text-xs text-[var(--text-2)] leading-relaxed">
          Each cycle = one sell-high + buy-back-low loop. Because your sell price is higher than your buy price, the cash from selling buys you <em>more shares</em> than you sold. Repeat this across cycles and your share count compounds — all before your target price is reached.
        </p>
        <div className="mt-2 p-2 rounded-xl bg-white flex items-center justify-between">
          <div className="text-center">
            <div className="text-[10px] text-[var(--text-2)] uppercase">Hold only</div>
            <div className="font-bold text-sm">{fmt(totalInitialAtTarget)}</div>
          </div>
          <div className="text-2xl font-bold text-[var(--success)]">→</div>
          <div className="text-center">
            <div className="text-[10px] text-[var(--text-2)] uppercase">After {activeCycles} cycles</div>
            <div className="font-bold text-sm" style={{ color: 'var(--success)' }}>{fmt(totalProjected)}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-[var(--text-2)] uppercase">Gain</div>
            <div className="font-bold text-sm" style={{ color: 'var(--success)' }}>
              +{fmt(totalProjected - totalInitialAtTarget)}
            </div>
          </div>
        </div>
      </div>

      {stocks.map((stock) => (
        <StockJourney key={stock.id} stock={stock} activeCycles={activeCycles} />
      ))}
    </div>
  );
}
