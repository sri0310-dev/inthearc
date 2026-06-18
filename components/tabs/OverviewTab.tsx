'use client';
import { useState, useMemo } from 'react';
import { Stock } from '@/lib/types';
import { fmt, fmtShares } from '@/lib/compute';

interface Props {
  stocks: Stock[];
  onAdjustShares: (stockId: string, newShares: number, note?: string) => void;
}

export default function OverviewTab({ stocks, onAdjustShares }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editShares, setEditShares] = useState('');
  const [editNote, setEditNote] = useState('');

  const portfolioValue = useMemo(
    () => stocks.reduce((sum, s) => sum + s.initialShares * s.currentPrice, 0),
    [stocks]
  );

  const allHistory = useMemo(() =>
    stocks
      .flatMap((s) => (s.adjustmentLog ?? []).map((e) => ({ ...e, stock: s })))
      .sort((a, b) => b.at.localeCompare(a.at)),
    [stocks]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 24 }}>

      {/* Big portfolio value */}
      <div style={{
        background: 'white', borderRadius: 20, border: '1px solid var(--border)',
        padding: '20px 16px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Portfolio Value
        </div>
        <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>
          {fmt(portfolioValue)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>live prices</div>

        {/* Per-stock breakdown */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 14 }}>
          {stocks.map((s) => (
            <div key={s.id} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.ticker}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                {fmt(s.initialShares * s.currentPrice)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)' }}>${s.currentPrice.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-stock cards */}
      {stocks.map((stock) => (
        <div
          key={stock.id}
          style={{
            background: 'white', borderRadius: 20,
            border: '1px solid var(--border)',
            borderLeft: `4px solid ${stock.color}`,
            padding: 16,
          }}
        >
          {editingId === stock.id ? (
            /* Edit mode */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: stock.color }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{stock.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 'auto' }}>
                  currently {fmtShares(stock.initialShares)} sh
                </span>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>
                  New Share Count
                </div>
                <input
                  type="number"
                  value={editShares}
                  onChange={(e) => setEditShares(e.target.value)}
                  placeholder={String(stock.initialShares)}
                  autoFocus
                  inputMode="numeric"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 12,
                    border: '1.5px solid var(--border)', fontSize: 20, fontWeight: 700,
                    background: 'var(--bg)', outline: 'none', color: 'var(--text)',
                  }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>
                  Note (optional)
                </div>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="e.g. Added from separate account"
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 12,
                    border: '1.5px solid var(--border)', fontSize: 14,
                    background: 'var(--bg)', outline: 'none', color: 'var(--text)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    const n = parseFloat(editShares);
                    if (!isNaN(n) && n > 0 && n !== stock.initialShares) {
                      onAdjustShares(stock.id, n, editNote.trim() || undefined);
                    }
                    setEditingId(null); setEditShares(''); setEditNote('');
                  }}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 12, border: 'none',
                    background: 'var(--text)', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => { setEditingId(null); setEditShares(''); setEditNote(''); }}
                  style={{
                    padding: '10px 18px', borderRadius: 12, border: '1px solid var(--border)',
                    background: 'transparent', fontSize: 14, color: 'var(--text-2)', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Display mode */
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: stock.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{stock.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: stock.color }}>{stock.ticker}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginLeft: 18 }}>
                    {fmtShares(stock.initialShares)} shares x ${stock.currentPrice.toFixed(2)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>
                    {fmt(stock.initialShares * stock.currentPrice)}
                  </div>
                  <button
                    onClick={() => {
                      setEditingId(stock.id);
                      setEditShares(String(stock.initialShares));
                      setEditNote('');
                    }}
                    style={{
                      background: 'var(--bg-card-2)', border: 'none', cursor: 'pointer',
                      fontSize: 11, fontWeight: 600, color: 'var(--text-2)', padding: '4px 10px',
                      borderRadius: 20, marginTop: 4,
                    }}
                  >
                    Edit shares
                  </button>
                </div>
              </div>

              {/* Target price row */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>At target (${stock.targetPrice})</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)' }}>
                  {fmt(stock.initialShares * stock.targetPrice)}
                </span>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Holdings history */}
      {allHistory.length > 0 && (
        <div style={{
          background: 'white', borderRadius: 20, border: '1px solid var(--border)', overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Holdings History</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {allHistory.map((e, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '12px 16px',
                  borderBottom: i < allHistory.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: e.stock.color, flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: e.stock.color }}>{e.stock.ticker}</span>
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>
                      {e.from} {'->'} <strong>{e.to}</strong> sh
                    </span>
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: e.to > e.from ? 'var(--success)' : 'var(--danger)',
                    }}>
                      {e.to > e.from ? '+' : ''}{e.to - e.from}
                    </span>
                  </div>
                  {e.note && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{e.note}</div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                    {new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
