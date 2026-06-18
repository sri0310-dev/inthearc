'use client';
import { useMemo, useState } from 'react';
import { Stock, CycleTarget } from '@/lib/types';
import { computeCycles, fmt, fmtShares } from '@/lib/compute';

interface Props {
  stocks: Stock[];
  activeCycles: number;
  onCyclesChange: (n: number) => void;
  onCycleUpdate: (stockId: string, cycleIndex: number, field: 'sell' | 'buy' | 'sellQty' | 'chasePercent', value: number) => void;
  onTargetUpdate: (stockId: string, value: number) => void;
  onActiveTrade: (stockId: string, cycleIndex: number, trade: { soldAt: number; soldQty: number } | null) => void;
}

// ─── Inline price input ───────────────────────────────────────────────────────
function PriceInput({
  value, color, onCommit,
}: {
  value: number;
  color: string;
  onCommit: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (editing) {
    return (
      <input
        type="number"
        autoFocus
        value={draft}
        inputMode="decimal"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = parseFloat(draft);
          if (!isNaN(v) && v > 0) onCommit(v);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const v = parseFloat(draft);
            if (!isNaN(v) && v > 0) onCommit(v);
            setEditing(false);
          }
          if (e.key === 'Escape') setEditing(false);
        }}
        style={{
          width: 80, padding: '4px 8px', borderRadius: 8, border: `1.5px solid ${color}`,
          fontSize: 16, fontWeight: 700, color, background: 'white', outline: 'none', textAlign: 'center',
        }}
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(value.toFixed(2)); setEditing(true); }}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
        fontSize: 16, fontWeight: 800, color, borderBottom: `2px dashed ${color}33`,
      }}
    >
      ${value.toFixed(2)}
    </button>
  );
}

// ─── Nudge+price row ──────────────────────────────────────────────────────────
function PriceRow({
  label, value, color, onChange,
}: {
  label: string; value: number; color: string; onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', width: 36, textTransform: 'uppercase' }}>
        {label}
      </span>
      <button
        onClick={() => onChange(Math.max(0.01, parseFloat((value - 5).toFixed(2))))}
        style={{
          width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--bg-card-2)', fontSize: 16, fontWeight: 700, color: 'var(--text-2)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        −5
      </button>
      <PriceInput value={value} color={color} onCommit={onChange} />
      <button
        onClick={() => onChange(parseFloat((value + 5).toFixed(2)))}
        style={{
          width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--bg-card-2)', fontSize: 16, fontWeight: 700, color: 'var(--text-2)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        +5
      </button>
    </div>
  );
}

// ─── Single stock view ────────────────────────────────────────────────────────
function StockView({
  stock, activeCycles, onCycleUpdate, onTargetUpdate, onActiveTrade, onCyclesChange,
}: {
  stock: Stock;
  activeCycles: number;
  onCycleUpdate: (cycleIndex: number, field: 'sell' | 'buy' | 'sellQty' | 'chasePercent', value: number) => void;
  onTargetUpdate: (value: number) => void;
  onActiveTrade: (cycleIndex: number, trade: { soldAt: number; soldQty: number } | null) => void;
  onCyclesChange: (n: number) => void;
}) {
  const cycleResults = useMemo(
    () => computeCycles(stock.initialShares, stock.cycles, activeCycles),
    [stock.initialShares, stock.cycles, activeCycles]
  );
  const finalResult = cycleResults[cycleResults.length - 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Stock header */}
      <div style={{
        background: 'white', borderRadius: 16, border: '1px solid var(--border)',
        borderLeft: `4px solid ${stock.color}`, padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{stock.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
              {fmtShares(stock.initialShares)} shares x ${stock.currentPrice.toFixed(2)} = {' '}
              <strong style={{ color: 'var(--text)' }}>{fmt(stock.initialShares * stock.currentPrice)}</strong>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>Price target</div>
            <PriceInput value={stock.targetPrice} color={stock.color} onCommit={onTargetUpdate} />
          </div>
        </div>
      </div>

      {/* Cycle cards */}
      {cycleResults.map((result, i) => {
        const cycle: CycleTarget = stock.cycles[i] ?? { sell: result.sell, buy: result.buy };
        const cash = result.tradeQty * cycle.sell;
        const sharesBack = result.sharesAfter - result.coreQty;
        const gainShares = result.gainShares;
        const gainPct = result.gainPct;

        // qty selector state: pill values
        const fullQty = result.sharesBefore;
        const halfQty = Math.floor(fullQty / 2);
        const thirdQty = Math.floor(fullQty / 3);
        const isAll = cycle.sellQty === undefined || cycle.sellQty >= fullQty;
        const isHalf = !isAll && cycle.sellQty === halfQty;
        const isThird = !isAll && cycle.sellQty === thirdQty;

        return (
          <div
            key={i}
            style={{
              background: 'white', borderRadius: 16, border: '1px solid var(--border)',
              overflow: 'hidden',
            }}
          >
            {/* Card header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', background: stock.color + '0F',
              borderBottom: '1px solid var(--border)',
            }}>
              <span style={{
                fontSize: 12, fontWeight: 800, color: stock.color,
                background: stock.color + '22', padding: '3px 10px', borderRadius: 20,
              }}>
                C{i + 1}
              </span>
              {result.valid ? (
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>
                  {fmtShares(result.sharesBefore)} {'->'} {fmtShares(result.sharesAfter)} sh
                  {' '}
                  <span style={{ color: stock.color }}>+{gainPct.toFixed(1)}%</span>
                </span>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--danger)' }}>Buy must be &lt; Sell</span>
              )}
            </div>

            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* SELL section */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Sell
                </div>
                <PriceRow
                  label="Price"
                  value={cycle.sell}
                  color="var(--warning)"
                  onChange={(v) => onCycleUpdate(i, 'sell', v)}
                />

                {/* Qty pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', width: 36, textTransform: 'uppercase' }}>
                    Qty
                  </span>
                  {[
                    { label: 'All', active: isAll, onClick: () => onCycleUpdate(i, 'sellQty', fullQty + 1) },
                    { label: '1/2', active: isHalf, onClick: () => onCycleUpdate(i, 'sellQty', halfQty) },
                    { label: '1/3', active: isThird, onClick: () => onCycleUpdate(i, 'sellQty', thirdQty) },
                  ].map((pill) => (
                    <button
                      key={pill.label}
                      onClick={pill.onClick}
                      style={{
                        padding: '6px 14px', borderRadius: 20, border: 'none',
                        background: pill.active ? stock.color : 'var(--bg-card-2)',
                        color: pill.active ? 'white' : 'var(--text-2)',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>

                {/* Sell summary */}
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-2)' }}>
                  {fmtShares(result.tradeQty)} shares {'->'}{' '}
                  <strong style={{ color: 'var(--text)' }}>{fmt(cash)}</strong> cash
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--border)' }} />

              {/* BUY BACK section */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Buy Back
                </div>
                <PriceRow
                  label="Price"
                  value={cycle.buy}
                  color="var(--success)"
                  onChange={(v) => onCycleUpdate(i, 'buy', v)}
                />

                {/* Buy back summary */}
                {result.valid && (
                  <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-2)' }}>
                    {'->'}{'  '}{fmtShares(sharesBack)} shares{' '}
                    <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                      (+{fmtShares(gainShares)} sh, +{gainPct.toFixed(1)}%)
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Cycle count control */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
        padding: '10px 0',
      }}>
        <button
          onClick={() => onCyclesChange(Math.max(1, activeCycles - 1))}
          style={{
            width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--border)',
            background: 'var(--bg-card-2)', fontSize: 22, fontWeight: 700, color: 'var(--text-2)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          −
        </button>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>
          {activeCycles} cycle{activeCycles !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => onCyclesChange(Math.min(5, activeCycles + 1))}
          style={{
            width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--border)',
            background: 'var(--bg-card-2)', fontSize: 22, fontWeight: 700, color: 'var(--text-2)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          +
        </button>
      </div>

      {/* Summary card */}
      {finalResult && (
        <div style={{
          borderRadius: 16, border: `1px solid ${stock.color}33`,
          background: stock.color + '0D', padding: '14px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>After {activeCycles} cycle{activeCycles !== 1 ? 's' : ''}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>
              {fmtShares(finalResult.sharesAfter)} shares
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Worth at ${stock.targetPrice} target</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>
              {fmt(finalResult.sharesAfter * stock.targetPrice)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main StrategyTab ─────────────────────────────────────────────────────────
export default function StrategyTab({ stocks, activeCycles, onCyclesChange, onCycleUpdate, onTargetUpdate, onActiveTrade }: Props) {
  const [activeStockId, setActiveStockId] = useState(stocks[0]?.id ?? '');
  const activeStock = stocks.find((s) => s.id === activeStockId) ?? stocks[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 24 }}>
      {/* Stock selector pills */}
      <div style={{
        display: 'flex', gap: 8, padding: '2px', background: 'var(--bg-card-2)',
        borderRadius: 24, alignSelf: 'flex-start',
      }}>
        {stocks.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveStockId(s.id)}
            style={{
              padding: '8px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: activeStockId === s.id ? s.color : 'transparent',
              color: activeStockId === s.id ? 'white' : 'var(--text-2)',
              fontSize: 13, fontWeight: 700, transition: 'all 0.15s',
            }}
          >
            {s.ticker}
          </button>
        ))}
      </div>

      {/* Active stock view */}
      {activeStock && (
        <StockView
          stock={activeStock}
          activeCycles={activeCycles}
          onCycleUpdate={(cycleIndex, field, value) => onCycleUpdate(activeStock.id, cycleIndex, field, value)}
          onTargetUpdate={(value) => onTargetUpdate(activeStock.id, value)}
          onActiveTrade={(cycleIndex, trade) => onActiveTrade(activeStock.id, cycleIndex, trade)}
          onCyclesChange={onCyclesChange}
        />
      )}
    </div>
  );
}
