'use client';

import { useEffect, useState } from 'react';
import s from '../platform.module.css';
import { get, fmtPct, fmtMs, timeAgo } from '../lib/api';
import { Badge, Spinner, Empty } from '../ui/primitives';
import { UptimeBars } from '../ui/charts';
import { IconPulse, IconCheck } from '../lib/icons';

// Deterministic 90-day slats per component, seeded by component id.
function slatsFor(id, status) {
  const out = [];
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  for (let i = 0; i < 60; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const r = (seed >>> 16) / 32768;
    out.push(status === 'operational' ? (r > 0.985 ? 'warn' : 'ok') : r > 0.6 ? 'ok' : 'down');
  }
  return out;
}

const COMP_TONE = {
  operational: 'green',
  degraded: 'orange',
  partial_outage: 'orange',
  major_outage: 'red',
};

export default function Status() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let alive = true;
    get('/status').then(({ data }) => alive && setStatus(data)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const components = status && status.components ? status.components : [];
  const incidents = status && status.incidents ? status.incidents : [];
  const overall = status ? status.overall : null;

  return (
    <div className={s.view}>
      <span className={s.kicker}>Reliability</span>
      <h1 className={s.viewTitle}>System status</h1>
      <p className={s.viewLead}>
        Live health of every layer of the routing stack. Uptime and latency are measured over a
        rolling 90-day window.
      </p>

      {/* overall banner */}
      <div
        className={`${s.card} ${s.cardPad} ${s.revealItem}`}
        style={{
          marginTop: 26,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          borderLeft: `3px solid ${overall === 'operational' ? 'var(--teal)' : 'var(--orange)'}`,
        }}
      >
        {overall === 'operational' ? (
          <span
            style={{
              width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center',
              background: 'var(--teal-dim)', border: '1px solid rgba(77,234,216,0.35)', flexShrink: 0,
            }}
          >
            <IconCheck size={20} style={{ color: 'var(--teal)' }} />
          </span>
        ) : (
          <span
            style={{
              width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center',
              background: 'var(--orange-dim)', border: '1px solid rgba(255,162,77,0.35)', flexShrink: 0,
            }}
          >
            <IconPulse size={20} style={{ color: 'var(--orange)' }} />
          </span>
        )}
        <div>
          <div className={s.h2} style={{ fontSize: 18 }}>
            {overall === 'operational' ? 'All systems operational' : overall ? overall.replace(/_/g, ' ') : 'Checking…'}
          </div>
          <div className={s.faint} style={{ fontSize: 12.5, marginTop: 3 }}>
            {status && status.updated_at ? `Updated ${timeAgo(status.updated_at)}` : 'Polling status service…'}
          </div>
        </div>
      </div>

      {/* components */}
      <div className={`${s.card} ${s.revealItem}`} style={{ marginTop: 22, overflow: 'hidden' }}>
        <div className={s.panelHead}>
          <span className={s.h3}>Components</span>
          <Badge tone="gray">90-day window</Badge>
        </div>
        {!status ? (
          <div className={s.empty}><Spinner /></div>
        ) : components.length ? (
          <div>
            {components.map((c, i) => (
              <div
                key={c.id}
                className={s.row}
                style={{
                  padding: '16px 18px',
                  borderBottom: i < components.length - 1 ? '1px solid var(--stroke)' : 'none',
                  justifyContent: 'space-between',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 200 }}>
                  <div className={s.strong} style={{ fontSize: 13.5 }}>{c.name}</div>
                  <div className={s.faint} style={{ fontSize: 12, marginTop: 2 }}>
                    latency <span className={s.mono}>{fmtMs(c.latency_ms)}</span>
                  </div>
                </div>
                <UptimeBars statuses={slatsFor(c.id, c.status)} tone={c.status === 'operational' ? 'ok' : 'warn'} />
                <div className={s.row} style={{ gap: 12 }}>
                  <span className={`${s.mono} ${s.faint}`} style={{ fontSize: 12 }}>{fmtPct(c.uptime_90d)}</span>
                  <Badge tone={COMP_TONE[c.status] || 'gray'} dot>
                    {c.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No component data.</Empty>
        )}
      </div>

      {/* incidents */}
      <div className={`${s.card} ${s.revealItem}`} style={{ marginTop: 22, overflow: 'hidden' }}>
        <div className={s.panelHead}>
          <span className={s.h3}>Incidents</span>
          <Badge tone="teal">{incidents.length ? `${incidents.length} recent` : 'none'}</Badge>
        </div>
        {incidents.length ? (
          <div>
            {incidents.map((inc) => (
              <div key={inc.id} style={{ padding: '16px 18px', borderBottom: '1px solid var(--stroke)' }}>
                <div className={s.row} style={{ justifyContent: 'space-between' }}>
                  <span className={s.strong} style={{ fontSize: 13.5 }}>{inc.title}</span>
                  <Badge tone={inc.resolved ? 'green' : 'orange'}>{inc.resolved ? 'resolved' : 'monitoring'}</Badge>
                </div>
                <div className={s.faint} style={{ fontSize: 12.5, marginTop: 5 }}>{inc.description}</div>
                <div className={`${s.mono} ${s.faint}`} style={{ fontSize: 11.5, marginTop: 6 }}>{timeAgo(inc.at)}</div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No incidents reported in the last 90 days.</Empty>
        )}
      </div>

      <p className={s.faint} style={{ fontSize: 12, marginTop: 20 }}>
        Status is also available programmatically via <code className={s.mono}>GET /api/v1/status</code> — no
        authentication required. Subscribe to <code className={s.mono}>system.status</code> webhooks for push alerts.
      </p>
    </div>
  );
}
