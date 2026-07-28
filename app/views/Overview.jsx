'use client';

import { useEffect, useRef, useState } from 'react';
import s from '../platform.module.css';
import { get, fmtUsd, fmtPct, fmtApy, fmtMs, fmtNum } from '../lib/api';
import { Badge } from '../ui/primitives';
import { Sparkline } from '../ui/charts';
import {
  IconArrowRight,
  IconBolt,
  IconBook,
  IconKey,
  IconPulse,
  IconVault,
  IconWebhook,
} from '../lib/icons';

// Animated count-up for headline numbers.
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const fromVal = from.current;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(fromVal + (target - fromVal) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function Stat({ label, value, delta, deltaTone, spark, sparkColor, delay }) {
  return (
    <div className={`${s.card} ${s.stat} ${s.revealItem}`} style={{ animationDelay: `${delay}ms` }}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{value}</div>
      {delta ? (
        <div
          className={s.statDelta}
          style={{ color: deltaTone === 'up' ? 'var(--green)' : 'var(--orange)' }}
        >
          {deltaTone === 'up' ? '\u25B2' : '\u25BC'} {delta}
        </div>
      ) : null}
      {spark && spark.length > 1 ? (
        <div className={s.statSpark}>
          <Sparkline values={spark} stroke={sparkColor || '#4dead8'} />
        </div>
      ) : null}
    </div>
  );
}

const QUICK_LINKS = [
  { icon: IconBolt, title: 'Quickstart', desc: 'First yield position in 5 minutes.', view: 'quickstart', tone: 'var(--blue-strong)' },
  { icon: IconBook, title: 'API Reference', desc: 'Every endpoint, live Try-it included.', view: 'reference', tone: 'var(--teal)' },
  { icon: IconKey, title: 'API Keys', desc: 'Issue and rotate credentials.', view: 'keys', tone: 'var(--orange)' },
  { icon: IconWebhook, title: 'Webhooks', desc: 'Signed events to your backend.', view: 'webhooks', tone: 'var(--purple)' },
];

export default function Overview({ go, apiKey }) {
  const [yieldData, setYieldData] = useState(null);
  const [vaults, setVaults] = useState(null);
  const [usage, setUsage] = useState(null);
  const [status, setStatus] = useState(null);
  const [liveResponse, setLiveResponse] = useState(null);
  const [respMs, setRespMs] = useState(null);

  useEffect(() => {
    let alive = true;
    const t0 = performance.now();
    get('/yield/USDC', { key: apiKey })
      .then(({ data }) => {
        if (!alive) return;
        setLiveResponse(data);
        setRespMs(Math.max(8, Math.round(performance.now() - t0)));
      })
      .catch(() => alive && setLiveResponse({ error: 'unavailable' }));
    return () => {
      alive = false;
    };
  }, [apiKey]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      get('/yield/USDC', { key: apiKey }).then(({ data }) => data).catch(() => null),
      get('/yield/USDT', { key: apiKey }).then(({ data }) => data).catch(() => null),
    ]).then((rows) => alive && setYieldData(rows.filter(Boolean)));
    get('/vaults', { key: apiKey }).then(({ data }) => alive && setVaults(data)).catch(() => {});
    get('/usage?range=30d', { key: apiKey }).then(({ data }) => alive && setUsage(data)).catch(() => {});
    get('/status').then(({ data }) => alive && setStatus(data)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [apiKey]);

  const yieldList = Array.isArray(yieldData) ? yieldData : yieldData ? [yieldData] : [];
  const bestApy = yieldList.length ? Math.max(...yieldList.map((y) => y.best_apy || 0)) : 0;
  const vaultList = Array.isArray(vaults) ? vaults : [];
  const totalTvl = vaultList.reduce((a, v) => a + (v.tvl_usd || 0), 0);
  const activeVaults = vaultList.filter((v) => v.status === 'active').length;
  const totalRequests = usage && usage.totals ? usage.totals.requests : 0;
  const p99 = usage && usage.totals ? usage.totals.p99_ms : 0;
  const reqSeries = usage && usage.series ? usage.series.map((p) => p.requests) : [];
  const uptime =
    status && status.components && status.components.length ? status.components[0].uptime_90d : 99.98;

  const tvlDisplay = useCountUp(totalTvl);
  const apyDisplay = useCountUp(bestApy);

  return (
    <div className={s.view}>
      {/* opening: headline + live terminal, not a centered hero */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,5fr) minmax(0,6fr)',
          gap: 28,
          alignItems: 'stretch',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span className={`${s.kicker} ${s.kickerTeal}`}>
            <span className={s.liveDot} style={{ display: 'inline-block', marginRight: 8, verticalAlign: 1 }} />
            Developer Platform · Sandbox live
          </span>
          <h1 className={s.viewTitle} style={{ fontSize: 34 }}>
            Yield infrastructure,
            <br />
            one API away.
          </h1>
          <p className={s.viewLead}>
            Route your users’ idle stablecoins across audited DeFi venues — Aave, Morpho, Compound
            and tokenized treasuries — without taking custody. Typed SDKs, signed webhooks, full
            observability. This console runs a deterministic, single-instance sandbox: every
            endpoint is real, but no funds move.
          </p>
          <div className={s.row} style={{ marginTop: 22 }}>
            <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => go('quickstart')}>
              Start integrating <IconArrowRight size={14} />
            </button>
            <button type="button" className={`${s.btn} ${s.btnSecondary}`} onClick={() => go('reference')}>
              API Reference
            </button>
          </div>
        </div>

        <div className={`${s.card} ${s.revealItem}`} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className={s.panelHead}>
            <div className={s.row}>
              <IconPulse size={15} style={{ color: 'var(--teal)' }} />
              <span className={s.h3}>Live sandbox request</span>
            </div>
            {respMs ? <Badge tone="teal" dot>{respMs}ms</Badge> : <Badge tone="gray">connecting…</Badge>}
          </div>
          <div style={{ padding: '14px 16px 4px' }}>
            <div className={s.mono} style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.8 }}>
              <span style={{ color: 'var(--teal)' }}>GET</span>{' '}
              <span style={{ color: 'var(--ink)' }}>/api/v1/yield/USDC</span>
              <br />
              <span>Authorization: Bearer tsk_test_····</span>
            </div>
          </div>
          <div style={{ padding: '10px 16px 16px', flex: 1, overflow: 'auto' }}>
            {liveResponse ? (
              <pre
                className={s.mono}
                style={{ fontSize: 11.5, lineHeight: 1.7, color: '#c3cee2', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {JSON.stringify(
                  liveResponse && liveResponse.breakdown
                    ? {
                        object: 'yield',
                        data: {
                          asset: liveResponse.asset,
                          best_apy: liveResponse.best_apy,
                          blend_apy: liveResponse.blend_apy,
                          venues: (liveResponse.breakdown || []).length,
                        },
                      }
                    : liveResponse,
                  null,
                  2,
                )}
              </pre>
            ) : (
              <div className={s.row} style={{ color: 'var(--ink-3)', fontSize: 12.5, padding: '18px 0' }}>
                <span className={s.spinner} /> Awaiting response from the routing engine…
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={s.statGrid} style={{ marginTop: 30 }}>
        <Stat
          label="Best live APY"
          value={fmtApy(apyDisplay)}
          delta="vs 4.1% avg"
          deltaTone="up"
          spark={[4.2, 4.8, 5.1, 5.6, 5.4, 6.0, 6.3, bestApy ? bestApy * 100 : 6.4]}
          sparkColor="#4dead8"
          delay={0}
        />
        <Stat
          label="TVL routed"
          value={fmtUsd(tvlDisplay, { compact: true })}
          delta="+12.4% 30d"
          deltaTone="up"
          spark={[22, 26, 25, 30, 34, 33, 38, 42]}
          sparkColor="#3a7fff"
          delay={60}
        />
        <Stat
          label="Active vaults"
          value={activeVaults ? String(activeVaults) : '—'}
          delta={`${vaultList.length} total venues`}
          deltaTone="up"
          spark={[5, 6, 6, 7, 7, 7, 8, activeVaults || 8]}
          sparkColor="#ae82ff"
          delay={120}
        />
        <Stat
          label="API p99 latency"
          value={p99 ? fmtMs(p99) : '—'}
          delta={`${fmtNum(totalRequests)} req / 30d`}
          deltaTone="up"
          spark={reqSeries.length > 2 ? reqSeries.slice(-12) : [10, 12, 11, 14, 13, 15, 14, 16]}
          sparkColor="#ffa24d"
          delay={180}
        />
      </div>

      <div style={{ marginTop: 34 }}>
        <div className={s.row} style={{ justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 className={s.h2}>Build with Thesauros</h2>
          <span className={s.faint} style={{ fontSize: 12.5 }}>
            90-day uptime <span className={s.mono} style={{ color: 'var(--teal)' }}>{fmtPct(uptime)}</span>
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {QUICK_LINKS.map((q, i) => (
            <button
              key={q.view}
              type="button"
              className={`${s.card} ${s.cardHover} ${s.cardPad} ${s.revealItem}`}
              style={{ textAlign: 'left', animationDelay: `${i * 60}ms`, cursor: 'pointer' }}
              onClick={() => go(q.view)}
            >
              <q.icon size={18} style={{ color: q.tone }} />
              <div className={s.h3} style={{ marginTop: 12 }}>{q.title}</div>
              <div className={s.faint} style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.5 }}>{q.desc}</div>
              <div className={s.row} style={{ marginTop: 14, color: 'var(--blue-strong)', fontSize: 12.5, fontWeight: 600 }}>
                Open <IconArrowRight size={13} />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className={s.grid2} style={{ marginTop: 34 }}>
        <div className={`${s.card} ${s.revealItem}`} style={{ animationDelay: '80ms' }}>
          <div className={s.panelHead}>
            <span className={s.h3}>Yield snapshot</span>
            <Badge tone="teal" dot>live</Badge>
          </div>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Best APY</th>
                <th>Blend APY</th>
                <th>30d avg</th>
              </tr>
            </thead>
            <tbody>
              {yieldList.map((y) => (
                <tr key={y.asset}>
                  <td className={s.strong}>{y.asset}</td>
                  <td className={`${s.num} ${s.pos}`}>{fmtApy(y.best_apy)}</td>
                  <td className={s.num}>{fmtApy(y.blend_apy)}</td>
                  <td className={s.num}>{fmtApy(y.blended_30d)}</td>
                </tr>
              ))}
              {!yieldList.length ? (
                <tr>
                  <td colSpan={4} className={s.faint}>Loading…</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className={`${s.card} ${s.cardPad} ${s.revealItem}`} style={{ animationDelay: '140ms' }}>
          <div className={s.row} style={{ justifyContent: 'space-between', marginBottom: 16 }}>
            <span className={s.h3}>Why it’s different</span>
            <IconVault size={16} style={{ color: 'var(--purple)' }} />
          </div>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 13 }}>
            {[
              ['Non-custodial by design', 'Funds never leave your users’ wallets. You never take custody, ever.'],
              ['Router, not a vault', 'Allocation shifts automatically to the best risk-adjusted venue.'],
              ['Audited core', 'Smart contracts reviewed by Hexens with no critical findings.'],
              ['Observable everything', 'Every rebalance, accrual and delivery is queryable and signed.'],
            ].map(([t, d]) => (
              <li key={t} className={s.row} style={{ alignItems: 'flex-start', gap: 12 }}>
                <span className={s.liveDot} style={{ marginTop: 6 }} />
                <span>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5 }}>{t}</span>
                  <span className={s.faint} style={{ fontSize: 12.5, lineHeight: 1.5 }}>{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
