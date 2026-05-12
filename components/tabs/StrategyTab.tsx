'use client';
import { useMemo } from 'react';
import { Stock, CycleTarget } from '@/lib/types';
import { computeCycles, fmt, fmtShares, isNearTarget } from '@/lib/compute';

interface Props {
  stocks: Stock[];
  activeCycles: number;
  onCyclesChange: (n: number) => void;
  onCycleUpdate: (stockId: string, cycleIndex: number, field: 'sell' | 'buy', value: number) => void;
  onTargetUpdate: (stockId: string, value: number) => void;
}

function CycleSection({
  cycleIndex,
  cycle,
  sharesBefore,
  sharesAfter,
  gainShares,
  gainPct,
  valid,
  stock,
  onChange,
}: {
  cycleIndex: number;
  cycle: CycleTarget;
  sharesBefore: number;
  sharesAfter: number;
  gainShares: number;
  gainPct: number;
  valid: boolean;
  stock: Stock;
  onChange: (field: 'sell' | 'buy', value: number) => void;
}) {
  const nearSell = isNearTarget(stock.currentPrice, cycle.sell);
  const nearBuy = isNearTarget(stock.currentPrice, cycle.buy);
  const sectionClass = nearSell ? 'cycle-near-sell' : nearBuy ? 'cycle-near-buy' : '';

  const sellMin = stock.currentPrice * 0.8;
  const sellMax = stock.targetPrice * 1.15;
  const buyMin = stock.currentPrice * 0.5;
  const buyMax = cycle.sell * 0.99;

  return (
    <div className={`rounded-xl p-3 mb-2 ${sectionClass || 'bg-[var(--bg-card-2)]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: stock.color + '22', color: stock.color }}
          >C{cycleIndex + 1}</span>
          {nearSell && <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full animate-pulse">NEAR SELL</span>}
          {nearBuy && <span className="text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full animate-pulse">NEAR BUY</span>}
        </div>
        <div className="text-right">
          {valid ? (
            <div>
              <span className="text-sm font-bold text-[var(--text)]">
                {fmtShares(sharesBefore)} → {fmtShares(sharesAfter)}
              </span>
              <span className="text-xs font-bold ml-2" style={{ color: 'var(--success)' }}>
                +{fmtShares(gainShares)} (+{gainPct.toFixed(1)}%)
              </span>
            </div>
          ) : (
            <span className="text-xs text-[var(--danger)]">Buy must be &lt; Sell</span>
          )}
        </div>
      </div>

      {/* Sell control */}
      <PriceControl
        label="SELL"
        arrow="↑"
        arrowColor="var(--warning)"
        value={cycle.sell}
        min={sellMin}
        max={sellMax}
        step={0.5}
        color={stock.color}
        invalid={!valid}
        onChange={(v) => onChange('sell', v)}
        currentPrice={stock.currentPrice}
      />

      {/* Buy control */}
      <PriceControl
        label="BUY"
        arrow="↓"
        arrowColor="var(--success)"
        value={cycle.buy}
        min={buyMin}
        max={buyMax}
        step={0.5}
        color={stock.color}
        invalid={!valid}
        onChange={(v) => onChange('buy', v)}
        currentPrice={stock.currentPrice}
      />
    </div>
  );
}

function PriceControl({
  label, arrow, arrowColor, value, min, max, step, color, invalid, onChange, currentPrice,
}: {
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
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v > 0) onChange(v);
              }}
              className="w-full pl-5 pr-2 py-2 text-sm font-bold bg-white border border-[var(--border)] rounded-lg focus:outline-none focus:border-current"
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
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(Math.max(value, min), max)}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1"
        style={{ accentColor: color }}
      />
    </div>
  );
}

function StockCard({
  stock,
  activeCycles,
  onCycleUpdate,
  onTargetUpdate,
}: {
  stock: Stock;
  activeCycles: number;
  onCycleUpdate: (cycleIndex: number, field: 'sell' | 'buy', value: number) => void;
  onTargetUpdate: (value: number) => void;
}) {
  const cycleResults = useMemo(
    () => computeCycles(stock.initialShares, stock.cycles, activeCycles),
    [stock.initialShares, stock.cycles, activeCycles]
  );

  const finalResult = cycleResults[cycleResults.length - 1];

  return (
    <div className="rounded-2xl bg-white border border-[var(--border)] overflow-hidden mb-4 card-hover">
      {/* Card header */}
      <div className="p-4 border-b border-[var(--border)]" style={{ borderLeft: `4px solid ${stock.color}` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: stock.color }} />
            <span className="font-bold text-[var(--text)]">{stock.name}</span>
            <span className="text-xs text-[var(--text-2)]">{stock.ticker}</span>
          </div>
          <div className="text-right">
            <div className="text-xs text-[var(--text-2)]">target</div>
            <input
              type="number"
              value={stock.targetPrice}
              onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) onTargetUpdate(v); }}
              className="text-sm font-bold text-right bg-transparent focus:outline-none w-20 border-b border-dashed border-[var(--border)]"
              style={{ color: stock.color }}
              inputMode="decimal"
            />
          </div>
        </div>
        <div className="text-xs text-[var(--text-2)] mt-1">
          {fmtShares(stock.initialShares)} shares @ ${stock.currentPrice.toFixed(2)} =&nbsp;
          <span className="font-bold text-[var(--text)]">{fmt(stock.initialShares * stock.currentPrice)}</span>
        </div>
      </div>

      {/* Cycles */}
      <div className="p-3">
        {cycleResults.map((result, i) => (
          <CycleSection
            key={i}
            cycleIndex={i}
            cycle={stock.cycles[i] ?? { sell: result.sell, buy: result.buy }}
            sharesBefore={result.sharesBefore}
            sharesAfter={result.sharesAfter}
            gainShares={result.gainShares}
            gainPct={result.gainPct}
            valid={result.valid}
            stock={stock}
            onChange={(field, value) => onCycleUpdate(i, field, value)}
          />
        ))}
      </div>

      {/* Footer summary */}
      {finalResult && (
        <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-between" style={{ background: stock.color + '0D' }}>
          <div>
            <div className="text-xs text-[var(--text-2)]">After {activeCycles} cycle{activeCycles !== 1 ? 's' : ''}</div>
            <div className="text-lg font-bold text-[var(--text)]">{fmtShares(finalResult.sharesAfter)} shares</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[var(--text-2)]">at ${stock.targetPrice}</div>
            <div className="text-lg font-bold" style={{ color: 'var(--success)' }}>
              {fmt(finalResult.sharesAfter * stock.targetPrice)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StrategyTab({ stocks, activeCycles, onCyclesChange, onCycleUpdate, onTargetUpdate }: Props) {
  return (
    <div className="animate-slide-up pb-6">
      {stocks.map((stock) => (
        <StockCard
          key={stock.id}
          stock={stock}
          activeCycles={activeCycles}
          onCycleUpdate={(cycleIndex, field, value) => onCycleUpdate(stock.id, cycleIndex, field, value)}
          onTargetUpdate={(value) => onTargetUpdate(stock.id, value)}
        />
      ))}

      {/* Global cycle control */}
      <div className="rounded-2xl bg-white border border-[var(--border)] p-4 mt-2">
        <div className="text-sm font-semibold mb-3">Cycles to simulate</div>
        <div className="flex items-center gap-3 justify-center">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => onCyclesChange(n)}
              className="w-10 h-10 rounded-full font-bold text-sm transition-all active:scale-95"
              style={{
                background: n === activeCycles ? 'var(--text)' : 'var(--bg-card-2)',
                color: n === activeCycles ? 'white' : 'var(--text-2)',
              }}
            >C{n}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
