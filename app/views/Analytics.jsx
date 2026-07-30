'use client';

import { useEffect, useState } from 'react';
import s from '../platform.module.css';
import { get, fmtUsd, fmtApy, timeAgo, shortAddr } from '../lib/api';
import { Badge, Empty, Spinner } from '../ui/primitives';
import { IconSpark, IconScale, IconArrowUpRight } from '../lib/icons';

const REGIME_TONE = { rising: 'teal', falling: 'orange', stable: 'blue', volatile: 'red' };
const REC_TONE = { overweight: 'teal', neutral: 'gray', underweight: 'orange' };

export default function Analytics({ apiKey }) {
  const [advisor, setAdvisor] = useState(null);
  const [uplift, setUplift] = useState(null);
  const [signals, setSignals] = useState(null);
  const [decisions, setDecisions] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      get('/analytics/advisor', { key: apiKey }).then((r) => r.data).catch(() => null),
      get('/analytics/uplift', { key: apiKey }).then((r) => r.data).catch(() => null),
      get('/analytics/signals', { key: apiKey }).then((r) => r.data).catch(() => []),
      get('/analytics/decisions?limit=20', { key: apiKey }).then((r) => r.data).catch(() => []),
    ]).then(([ad, up, sig, dec]) => {
      if (!alive) return;
      setAdvisor(ad);
      setUplift(up);
      setSignals(sig);
      setDecisions(dec);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [apiKey]);

  const t = uplift ? uplift.totals : null;
  const beating = t && t.uplift_vs_aave >= 0;

  return (
    <div className={s.view}>
      <span className={`${s.kicker} ${s.kickerTeal}`}>Intelligence</span>
      <h1 className={s.viewTitle}>Analytics & advisor</h1>
      <p className={s.viewLead}>
        The measurement layer behind the AI-over-PSO concept: baseline uplift, an explainable
        decision log, risk-adjusted signals, regime and a template advisor. Deterministic and
        derived from live sandbox data — no black box.
      </p>

      {loading ? (
        <div className={s.empty}><Spinner /></div>
      ) : (
        <>
          {/* advisor banner */}
          {advisor ? (
            <div
              className={`${s.card} ${s.cardPad} ${s.revealItem}`}
              style={{ marginTop: 24, borderLeft: `3px solid ${beating ? 'var(--teal)' : 'var(--orange)'}` }}
            >
              <div className={s.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div className={s.row} style={{ gap: 12 }}>
                  <span
                    style={{
                      width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center',
                      background: 'var(--purple-dim)', border: '1px solid rgba(174,130,255,0.35)', flexShrink: 0,
                    }}
                  >
                    <IconSpark size={22} style={{ color: 'var(--purple)' }} />
                  </span>
                  <div>
                    <div className={s.row} style={{ gap: 10 }}>
                      <span className={s.h2} style={{ fontSize: 18 }}>Strategy advisor</span>
                      <Badge tone={REGIME_TONE[advisor.regime] || 'gray'} dot>{advisor.regime}</Badge>
                    </div>
                    <div className={s.faint} style={{ fontSize: 12, marginTop: 3 }}>Template-generated · not an ML model or LLM</div>
                  </div>
                </div>
              </div>
              <p className={s.strong} style={{ fontSize: 14.5, marginTop: 16, lineHeight: 1.55 }}>{advisor.headline}</p>
              <ul style={{ listStyle: 'none', padding: 0, marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {advisor.bullets.map((b, i) => (
                  <li key={i} className={s.row} style={{ alignItems: 'flex-start', gap: 10 }}>
                    <span className={s.liveDot} style={{ marginTop: 6 }} />
                    <span className={s.muted} style={{ fontSize: 13, lineHeight: 1.55 }}>{b}</span>
                  </li>
                ))}
              </ul>
              <div className={s.faint} style={{ fontSize: 11.5, marginTop: 14, fontStyle: 'italic' }}>{advisor.disclaimer}</div>
            </div>
          ) : null}

          {/* uplift stats */}
          {t ? (
            <div className={s.statGrid} style={{ marginTop: 18 }}>
              {[
                { label: 'Routed value', value: fmtUsd(t.current_value, { compact: true }), tone: 'var(--ink)' },
                { label: 'Aave-only baseline', value: fmtUsd(t.aave_baseline, { compact: true }), tone: 'var(--blue-strong)' },
                { label: 'Uplift vs Aave', value: `${beating ? '+' : ''}${fmtUsd(t.uplift_vs_aave)}`, tone: beating ? 'var(--green)' : 'var(--red)' },
                { label: 'Uplift %', value: `${t.uplift_vs_aave_pct >= 0 ? '+' : ''}${t.uplift_vs_aave_pct.toFixed(3)}%`, tone: beating ? 'var(--green)' : 'var(--red)' },
              ].map((st, i) => (
                <div key={st.label} className={`${s.card} ${s.stat} ${s.revealItem}`} style={{ animationDelay: `${i * 50}ms` }}>
                  <div className={s.statLabel}>{st.label}</div>
                  <div className={s.statValue} style={{ color: st.tone, fontSize: 22 }}>{st.value}</div>
                </div>
              ))}
            </div>
          ) : null}

          {/* signals + top opportunities */}
          <div className={s.grid2} style={{ marginTop: 22 }}>
            <div className={`${s.card} ${s.revealItem}`} style={{ overflow: 'hidden' }}>
              <div className={s.panelHead}>
                <span className={s.h3}>Risk-adjusted signals</span>
                <Badge tone="purple" dot>ranked</Badge>
              </div>
              {signals && signals.length ? (
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Vault</th>
                      <th>Raw</th>
                      <th>Risk-adj</th>
                      <th>Forecast</th>
                      <th>Call</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signals.map((sig) => (
                      <tr key={sig.vault_id}>
                        <td className={`${s.mono} ${s.faint}`}>{sig.rank}</td>
                        <td>
                          <div className={s.strong} style={{ fontSize: 12.5 }}>{sig.name}</div>
                          <div className={`${s.mono} ${s.faint}`} style={{ fontSize: 10.5 }}>{sig.asset} · {sig.risk_tier}</div>
                        </td>
                        <td className={s.num}>{fmtApy(sig.apy)}</td>
                        <td className={`${s.num} ${s.pos}`}>{fmtApy(sig.risk_adjusted_apy)}</td>
                        <td className={s.num}>{fmtApy(sig.forecast_apy)}</td>
                        <td><Badge tone={REC_TONE[sig.recommendation] || 'gray'}>{sig.recommendation}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className={s.empty}>No signals.</div>
              )}
            </div>

            {/* uplift per position */}
            <div className={`${s.card} ${s.revealItem}`} style={{ overflow: 'hidden', animationDelay: '60ms' }}>
              <div className={s.panelHead}>
                <span className={s.h3}>Uplift by position</span>
                <Badge tone="gray">vs Aave</Badge>
              </div>
              {uplift && uplift.positions.length ? (
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Position</th>
                      <th>Asset</th>
                      <th>Value</th>
                      <th>Baseline</th>
                      <th>Uplift</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uplift.positions.map((p) => (
                      <tr key={p.position_id}>
                        <td className={`${s.mono} ${s.faint}`} style={{ fontSize: 11 }}>{shortAddr(p.position_id)}</td>
                        <td className={s.strong}>{p.asset}</td>
                        <td className={s.num}>{fmtUsd(p.current_value)}</td>
                        <td className={s.num}>{fmtUsd(p.aave_baseline)}</td>
                        <td className={s.num} style={{ color: p.uplift_vs_aave >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {p.uplift_vs_aave >= 0 ? '+' : ''}{fmtUsd(p.uplift_vs_aave)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className={s.empty}>No active positions.</div>
              )}
            </div>
          </div>

          {/* decision log */}
          <div className={`${s.card} ${s.revealItem}`} style={{ marginTop: 22, overflow: 'hidden' }}>
            <div className={s.panelHead}>
              <span className={s.h3}>Decision log</span>
              <Badge tone="teal" dot>explainable</Badge>
            </div>
            {decisions && decisions.length ? (
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Type</th>
                    <th>Move</th>
                    <th>APY</th>
                    <th>Exp. uplift</th>
                    <th>Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((d) => (
                    <tr key={d.id}>
                      <td className={`${s.mono} ${s.faint}`} style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{timeAgo(d.at)}</td>
                      <td><Badge tone={d.type === 'rebalance' ? 'purple' : 'teal'}>{d.type === 'rebalance' ? 'rebalance' : 'routing'}</Badge></td>
                      <td className={`${s.mono} ${s.faint}`} style={{ fontSize: 11 }}>
                        {d.from_vault ? `${shortAddr(d.from_vault)} → ` : '→ '}{shortAddr(d.to_vault)}
                      </td>
                      <td className={s.num} style={{ fontSize: 12 }}>
                        {d.apy_before != null ? `${fmtApy(d.apy_before)} → ` : ''}{fmtApy(d.apy_after)}
                      </td>
                      <td className={s.num} style={{ color: (d.expected_uplift_bps || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {d.expected_uplift_bps != null ? `${d.expected_uplift_bps >= 0 ? '+' : ''}${d.expected_uplift_bps} bps` : '—'}
                      </td>
                      <td className={s.faint} style={{ fontSize: 12, maxWidth: 360 }}>{d.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>No decisions recorded.</Empty>
            )}
          </div>
        </>
      )}
    </div>
  );
}
