'use client';

import { useEffect, useState } from 'react';
import s from '../platform.module.css';
import { get, fmtNum, fmtMs } from '../lib/api';
import { Badge, Spinner } from '../ui/primitives';
import { LineChart } from '../ui/charts';

const RANGES = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
];

function labelFor(t, range) {
  const d = new Date(t);
  if (range === '24h') return d.toLocaleTimeString('en-US', { hour: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Usage({ apiKey }) {
  const [range, setRange] = useState('7d');
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    get(`/usage?range=${range}`, { key: apiKey })
      .then(({ data }) => alive && setUsage(data))
      .catch(() => alive && setUsage(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [range, apiKey]);

  const totals = usage && usage.totals ? usage.totals : {};
  const series = usage && usage.series ? usage.series : [];
  const labels = series.map((p) => labelFor(p.t, range));
  const errRate = totals.requests ? ((totals.errors || 0) / totals.requests) * 100 : 0;

  return (
    <div className={s.view}>
      <div className={s.row} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className={s.kicker}>Observability</span>
          <h1 className={s.viewTitle}>Usage</h1>
          <p className={s.viewLead}>
            Request volume, error rate and latency for your integration. Data reflects real calls
            made from this portal plus simulated production traffic.
          </p>
        </div>
        <div className={s.codeTabs} role="tablist" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r.id} type="button" role="tab" aria-selected={range === r.id} className={`${s.codeTab} ${range === r.id ? s.codeTabActive : ''}`} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* totals */}
      <div className={s.statGrid} style={{ marginTop: 26 }}>
        {[
          { label: 'Requests', value: fmtNum(totals.requests || 0), tone: 'var(--blue-strong)' },
          { label: 'Errors', value: fmtNum(totals.errors || 0), tone: 'var(--red)' },
          { label: 'Error rate', value: `${(errRate || 0).toFixed(2)}%`, tone: errRate > 1 ? 'var(--orange)' : 'var(--green)' },
          { label: 'p50 latency', value: fmtMs(totals.p50_ms || 0), tone: 'var(--teal)' },
        ].map((st, i) => (
          <div key={st.label} className={`${s.card} ${s.stat} ${s.revealItem}`} style={{ animationDelay: `${i * 50}ms` }}>
            <div className={s.statLabel}>{st.label}</div>
            <div className={s.statValue} style={{ color: st.tone }}>{loading ? '—' : st.value}</div>
          </div>
        ))}
      </div>

      {/* requests chart */}
      <div className={`${s.card} ${s.revealItem}`} style={{ marginTop: 24, overflow: 'hidden' }}>
        <div className={s.panelHead}>
          <span className={s.h3}>Requests over time</span>
          <div className={s.row}>
            <Badge tone="blue">requests</Badge>
            <Badge tone="red">errors</Badge>
          </div>
        </div>
        <div style={{ padding: '16px 18px 8px' }}>
          {loading ? (
            <div className={s.empty}><Spinner /></div>
          ) : series.length ? (
            <LineChart
              series={[
                { label: 'requests', color: '#3a7fff', values: series.map((p) => p.requests) },
                { label: 'errors', color: '#ff6b6b', values: series.map((p) => p.errors || 0), fill: false },
              ]}
              labels={labels}
              yFmt={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : Math.round(v))}
            />
          ) : (
            <div className={s.empty}>No data for this range.</div>
          )}
        </div>
      </div>

      {/* latency chart */}
      <div className={`${s.card} ${s.revealItem}`} style={{ marginTop: 22, overflow: 'hidden' }}>
        <div className={s.panelHead}>
          <span className={s.h3}>Latency percentiles</span>
          <div className={s.row}>
            <Badge tone="teal">p50</Badge>
            <Badge tone="orange">p99</Badge>
          </div>
        </div>
        <div style={{ padding: '16px 18px 8px' }}>
          {loading ? (
            <div className={s.empty}><Spinner /></div>
          ) : series.length ? (
            <LineChart
              series={[
                { label: 'p50', color: '#4dead8', values: series.map((p) => p.p50_ms) },
                { label: 'p99', color: '#ffa24d', values: series.map((p) => p.p99_ms), fill: false },
              ]}
              labels={labels}
              yFmt={(v) => `${Math.round(v)}ms`}
            />
          ) : (
            <div className={s.empty}>No data for this range.</div>
          )}
        </div>
      </div>
    </div>
  );
}
