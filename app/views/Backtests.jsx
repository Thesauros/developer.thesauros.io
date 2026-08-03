'use client';

import { useCallback, useEffect, useState } from 'react';
import s from '../platform.module.css';
import { get, fmtUsd, fmtApy } from '../lib/api';
import { Badge, Empty, Spinner } from '../ui/primitives';
import { LineChart, BarList } from '../ui/charts';
import { IconChart, IconRefresh, IconScale } from '../lib/icons';

const STRATEGY_META = {
  'aave-only': { label: 'Aave-only (baseline)', color: '#3a7fff', tone: 'blue' },
  'best-apy': { label: 'Best APY (greedy)', color: '#ffa24d', tone: 'orange' },
  'risk-adjusted-pso': { label: 'Risk-adjusted PSO', color: '#4dead8', tone: 'teal' },
};
const RANGES = [
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
  { days: 180, label: '180d' },
];
const DAY_MS = 24 * 60 * 60 * 1000;

export default function Backtests({ apiKey }) {
  const [asset, setAsset] = useState('USDC');
  const [days, setDays] = useState(90);
  const [compare, setCompare] = useState(null);
  const [pso, setPso] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const to = Date.now();
    const from = to - days * DAY_MS;
    Promise.all([
      get(`/analytics/backtests/compare?asset=${asset}&from=${from}&to=${to}`, { key: apiKey })
        .then((r) => r.data)
        .catch((e) => {
          setError(e.message);
          return null;
        }),
      get(`/analytics/pso?asset=${asset}`, { key: apiKey })
        .then((r) => r.data)
        .catch(() => null),
    ]).then(([cmp, ps]) => {
      setCompare(cmp);
      setPso(ps);
      setLoading(false);
    });
  }, [apiKey, asset, days]);

  useEffect(() => {
    load();
  }, [load]);

  const strategies = compare ? compare.strategies : [];
  const winner = strategies.length
    ? strategies.reduce((a, b) => (b.final_value > a.final_value ? b : a))
    : null;

  const equitySeries = compare
    ? compare.series.map((sr) => ({
        label: STRATEGY_META[sr.strategy]?.label || sr.strategy,
        color: STRATEGY_META[sr.strategy]?.color || '#8ca0ff',
        values: sr.points.map((p) => p.value),
      }))
    : [];
  const equityLabels = compare && compare.series.length
    ? compare.series[0].points.map((p) => new Date(p.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
    : [];

  const psoAllocations = pso
    ? pso.allocations.map((a) => ({ label: a.name, value: a.weight, color: STRATEGY_META['risk-adjusted-pso'].color }))
    : [];

  return (
    <div className={s.view}>
      <div className={s.row} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className={s.kicker}>Intelligence</span>
          <h1 className={s.viewTitle}>Backtests</h1>
          <p className={s.viewLead}>
            Replay historical rate series through competing allocation strategies. This is the
            evidence layer for the optimizer: does it beat the passive baseline, and at what risk?
          </p>
        </div>
        <button type="button" className={`${s.btn} ${s.btnSecondary}`} onClick={load}>
          <IconRefresh size={14} /> Rerun
        </button>
      </div>

      {/* controls */}
      <div className={s.row} style={{ marginTop: 20, gap: 10, flexWrap: 'wrap' }}>
        <div className={s.codeTabs} role="tablist" aria-label="Asset">
          {['USDC', 'USDT'].map((a) => (
            <button key={a} type="button" role="tab" aria-selected={asset === a} className={`${s.codeTab} ${asset === a ? s.codeTabActive : ''}`} onClick={() => setAsset(a)}>
              {a}
            </button>
          ))}
        </div>
        <div className={s.codeTabs} role="tablist" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r.days} type="button" role="tab" aria-selected={days === r.days} className={`${s.codeTab} ${days === r.days ? s.codeTabActive : ''}`} onClick={() => setDays(r.days)}>
              {r.label}
            </button>
          ))}
        </div>
        <span className={s.faint} style={{ fontSize: 12.5 }}>principal $10,000 · rebalance every 7d · simulated rates</span>
      </div>

      {error ? (
        <div className={`${s.card} ${s.cardPad}`} style={{ marginTop: 16, color: 'var(--red)', fontSize: 13 }}>{error}</div>
      ) : null}

      {loading ? (
        <div className={s.empty}><Spinner /></div>
      ) : compare ? (
        <>
          {/* verdict banner */}
          <div
            className={`${s.card} ${s.cardPad} ${s.revealItem}`}
            style={{ marginTop: 20, borderLeft: '3px solid var(--teal)', display: 'flex', gap: 16, alignItems: 'center' }}
          >
            <span
              style={{
                width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center',
                background: 'var(--teal-dim)', border: '1px solid rgba(77,234,216,0.35)', flexShrink: 0,
              }}
            >
              <IconScale size={22} style={{ color: 'var(--teal)' }} />
            </span>
            <div>
              <div className={s.h3} style={{ fontSize: 15 }}>
                {winner ? `${STRATEGY_META[winner.strategy]?.label || winner.strategy} leads at ${fmtUsd(winner.final_value)}` : 'No result'}
              </div>
              <div className={s.faint} style={{ fontSize: 12.5, marginTop: 3 }}>
                vs the Aave-only baseline over {days} days. Risk-adjusted PSO trades a little return for the
                lowest volatility. Rates are simulated; connect real data to validate.
              </div>
            </div>
          </div>

          {/* strategy comparison table */}
          <div className={`${s.card} ${s.revealItem}`} style={{ marginTop: 18, overflow: 'hidden' }}>
            <div className={s.panelHead}>
              <span className={s.h3}>Strategy comparison</span>
              <Badge tone="gray">baseline: {compare.baseline}</Badge>
            </div>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>Final value</th>
                  <th>APY</th>
                  <th>Volatility</th>
                  <th>Max DD</th>
                  <th>Rebalances</th>
                  <th>Uplift vs baseline</th>
                </tr>
              </thead>
              <tbody>
                {strategies.map((st) => (
                  <tr key={st.strategy}>
                    <td>
                      <div className={s.row} style={{ gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: STRATEGY_META[st.strategy]?.color, flexShrink: 0 }} />
                        <span className={s.strong} style={{ fontSize: 13 }}>{STRATEGY_META[st.strategy]?.label || st.strategy}</span>
                      </div>
                    </td>
                    <td className={`${s.num} ${s.strong}`}>{fmtUsd(st.final_value)}</td>
                    <td className={`${s.num} ${s.pos}`}>{fmtApy(st.apy)}</td>
                    <td className={s.num}>{st.volatility_pct.toFixed(3)}%</td>
                    <td className={s.num}>{st.max_drawdown_pct.toFixed(2)}%</td>
                    <td className={s.num}>{st.rebalances}</td>
                    <td className={s.num} style={{ color: st.uplift_vs_baseline >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {st.uplift_vs_baseline >= 0 ? '+' : ''}{fmtUsd(st.uplift_vs_baseline)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* equity curves */}
          <div className={`${s.card} ${s.revealItem}`} style={{ marginTop: 18, overflow: 'hidden' }}>
            <div className={s.panelHead}>
              <span className={s.h3}>Equity curves</span>
              <div className={s.row} style={{ gap: 6 }}>
                {strategies.map((st) => (
                  <Badge key={st.strategy} tone={STRATEGY_META[st.strategy]?.tone || 'gray'}>{STRATEGY_META[st.strategy]?.label || st.strategy}</Badge>
                ))}
              </div>
            </div>
            <div style={{ padding: '16px 18px 8px' }}>
              {equitySeries.length ? (
                <LineChart series={equitySeries} labels={equityLabels} yFmt={(v) => fmtUsd(v, { compact: true })} />
              ) : (
                <div className={s.empty}>No equity data.</div>
              )}
            </div>
          </div>

          {/* PSO allocation */}
          <div className={s.grid2} style={{ marginTop: 18 }}>
            <div className={`${s.card} ${s.cardPad} ${s.revealItem}`}>
              <div className={s.row} style={{ justifyContent: 'space-between', marginBottom: 16 }}>
                <span className={s.h3}>Current PSO allocation</span>
                {pso ? <Badge tone="teal">exp. return {fmtApy(pso.expected_return)}</Badge> : null}
              </div>
              {psoAllocations.length ? (
                <BarList items={psoAllocations} fmt={(v) => `${(v * 100).toFixed(1)}%`} />
              ) : (
                <div className={s.faint} style={{ fontSize: 13 }}>No allocation.</div>
              )}
            </div>

            <div className={`${s.card} ${s.cardPad} ${s.revealItem}`} style={{ animationDelay: '60ms' }}>
              <div className={s.row} style={{ gap: 10, marginBottom: 12 }}>
                <IconChart size={16} style={{ color: 'var(--purple)' }} />
                <span className={s.h3}>How to read this</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
                {[
                  ['Baseline', 'Aave-only is the passive bar. Everything is measured against it.'],
                  ['Best APY', 'Chases the single highest rate. Highest return, most rate churn.'],
                  ['Risk-adjusted PSO', 'Optimizes weights by risk-adjusted signal; diversifies, lowest volatility.'],
                  ['Volatility', 'Annualized spread of daily returns — the real risk in a principal-preserving strategy.'],
                ].map(([t, d]) => (
                  <li key={t} className={s.row} style={{ alignItems: 'flex-start', gap: 11 }}>
                    <span className={s.liveDot} style={{ marginTop: 6 }} />
                    <span>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>{t}</span>
                      <span className={s.faint} style={{ fontSize: 12.5, lineHeight: 1.5 }}>{d}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      ) : (
        <Empty>Run a backtest to see results.</Empty>
      )}
    </div>
  );
}
