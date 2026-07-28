'use client';

import { useCallback, useEffect, useState } from 'react';
import s from '../platform.module.css';
import { get, post, del, timeAgo, fmtMs, shortHash } from '../lib/api';
import { Badge, Modal, CodeBlock, Empty, Spinner, CopyButton } from '../ui/primitives';
import { WEBHOOK_EVENTS } from '../data/endpoints';
import { WEBHOOK_VERIFY } from '../data/code';
import { IconWebhook, IconPlus, IconTrash, IconSend, IconRefresh } from '../lib/icons';

const LANGS = [
  { id: 'ts', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'curl', label: 'Format' },
];

export default function Webhooks({ apiKey }) {
  const [hooks, setHooks] = useState(null);
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [selEvents, setSelEvents] = useState(['position.active', 'position.rebalanced']);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [testing, setTesting] = useState(null);
  const [verifyLang, setVerifyLang] = useState('ts');
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      get('/webhooks', { key: apiKey }).then(({ data }) => setHooks(Array.isArray(data) ? data : [])),
      get('/webhooks/events', { key: apiKey }).then(({ data }) => setEvents(Array.isArray(data) ? data : [])).catch(() => setEvents([])),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiKey]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleEvent = (ev) =>
    setSelEvents((prev) => (prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]));

  async function createHook(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { data } = await post('/webhooks', { url, events: selEvents }, { key: apiKey });
      setCreated(data);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function testHook(id) {
    setTesting(id);
    setError(null);
    try {
      await post(`/webhooks/${id}/test`, {}, { key: apiKey });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(null);
    }
  }

  async function removeHook(id) {
    setError(null);
    try {
      await del(`/webhooks/${id}`, { key: apiKey });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className={s.view}>
      <div className={s.row} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className={s.kicker}>Events</span>
          <h1 className={s.viewTitle}>Webhooks</h1>
          <p className={s.viewLead}>
            Subscribe your backend to position lifecycle events. Every delivery is HMAC-SHA256
            signed so you can verify authenticity with a single helper.
          </p>
        </div>
        <div className={s.row}>
          <button type="button" className={`${s.btn} ${s.btnSecondary}`} onClick={load}>
            <IconRefresh size={14} /> Refresh
          </button>
          <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => { setCreated(null); setCreateOpen(true); }}>
            <IconPlus size={14} /> Add endpoint
          </button>
        </div>
      </div>

      {error ? (
        <div className={`${s.card} ${s.cardPad}`} style={{ marginTop: 16, color: 'var(--red)', fontSize: 13 }}>{error}</div>
      ) : null}

      {/* endpoints */}
      <div className={`${s.card} ${s.revealItem}`} style={{ marginTop: 26, overflow: 'hidden' }}>
        <div className={s.panelHead}>
          <span className={s.h3}>Endpoints</span>
          <Badge tone="gray">{hooks ? hooks.length : 0}</Badge>
        </div>
        {loading ? (
          <div className={s.empty}><Spinner /></div>
        ) : hooks && hooks.length ? (
          <table className={s.table}>
            <thead>
              <tr>
                <th>URL</th>
                <th>Events</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {hooks.map((h) => (
                <tr key={h.id}>
                  <td className={`${s.mono} ${s.strong}`} style={{ fontSize: 12 }}>{h.url}</td>
                  <td>
                    <div className={s.row} style={{ flexWrap: 'wrap', gap: 5 }}>
                      {(h.events || []).slice(0, 3).map((ev) => (
                        <Badge key={ev} tone="purple">{ev}</Badge>
                      ))}
                      {(h.events || []).length > 3 ? <span className={s.faint} style={{ fontSize: 11 }}>+{h.events.length - 3}</span> : null}
                    </div>
                  </td>
                  <td>{h.active ? <Badge tone="green" dot>active</Badge> : <Badge tone="gray">inactive</Badge>}</td>
                  <td className={s.faint} style={{ fontSize: 12.5 }}>{timeAgo(h.created_at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div className={s.row} style={{ justifyContent: 'flex-end', gap: 8 }}>
                      <button
                        type="button"
                        className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                        onClick={() => testHook(h.id)}
                        disabled={testing === h.id}
                      >
                        {testing === h.id ? <span className={s.spinner} /> : <IconSend size={12} />} Test
                      </button>
                      <button type="button" className={`${s.btn} ${s.btnDanger} ${s.btnSm}`} onClick={() => removeHook(h.id)}>
                        <IconTrash size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No endpoints yet. Add one to start receiving signed events.</Empty>
        )}
      </div>

      {/* delivery log */}
      <div className={`${s.card} ${s.revealItem}`} style={{ marginTop: 22, overflow: 'hidden' }}>
        <div className={s.panelHead}>
          <span className={s.h3}>Delivery log</span>
          <Badge tone="teal" dot>recent</Badge>
        </div>
        {events && events.length ? (
          <table className={s.table}>
            <thead>
              <tr>
                <th>Event</th>
                <th>Target</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Latency</th>
                <th>Signature</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {events.slice(0, 12).map((d) => (
                <tr key={d.id}>
                  <td><Badge tone="purple">{d.event || d.type}</Badge></td>
                  <td
                    className={`${s.mono} ${s.faint}`}
                    style={{ fontSize: 11.5, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={d.url}
                  >
                    {d.url || (d.webhook_id || '').slice(0, 12)}
                  </td>
                  <td>
                    {d.status === 'delivered' ? <Badge tone="green" dot>delivered</Badge> : <Badge tone="red">failed</Badge>}
                  </td>
                  <td className={s.num}>{d.attempts}</td>
                  <td className={s.num}>{d.latency_ms ? fmtMs(d.latency_ms) : '—'}</td>
                  <td className={`${s.mono} ${s.faint}`} style={{ fontSize: 11 }}>{d.signature ? shortHash(d.signature.split('v1=')[1] || d.signature) : '—'}</td>
                  <td className={s.faint} style={{ fontSize: 12.5 }}>{timeAgo(d.at || d.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No deliveries yet. Send a test event from an endpoint above.</Empty>
        )}
      </div>

      {/* signature verification */}
      <div className={s.revealItem} style={{ marginTop: 30 }}>
        <div className={s.row} style={{ justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h2 className={s.h2}>Verify signatures</h2>
            <p className={s.faint} style={{ fontSize: 13, marginTop: 5, maxWidth: 620 }}>
              Each delivery carries a <code className={s.mono}>Webhook-Signature</code> header.
              Recompute the HMAC over <code className={s.mono}>&quot;&lt;t&gt;.&lt;raw_body&gt;&quot;</code> with your
              endpoint secret and compare in constant time.
            </p>
          </div>
          <div className={s.codeTabs}>
            {LANGS.map((l) => (
              <button key={l.id} type="button" className={`${s.codeTab} ${verifyLang === l.id ? s.codeTabActive : ''}`} onClick={() => setVerifyLang(l.id)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <CodeBlock {...WEBHOOK_VERIFY[verifyLang]} />
      </div>

      {/* create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={created ? 'Endpoint registered' : 'Add webhook endpoint'}>
        {created ? (
          <>
            <div className={`${s.card} ${s.cardPad}`} style={{ borderLeft: '3px solid var(--teal)', background: 'var(--bg-inset)' }}>
              <div className={s.h3} style={{ fontSize: 13 }}>Signing secret — shown once</div>
              <code className={s.mono} style={{ display: 'block', marginTop: 10, fontSize: 12.5, wordBreak: 'break-all', color: 'var(--teal)' }}>
                {created.secret}
              </code>
              <div className={s.row} style={{ marginTop: 12 }}>
                <CopyButton text={created.secret} label="Copy secret" />
              </div>
            </div>
            <p className={s.faint} style={{ fontSize: 12.5 }}>
              Use this secret to verify the <code className={s.mono}>Webhook-Signature</code> header on every delivery.
            </p>
            <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => setCreateOpen(false)}>Done</button>
          </>
        ) : (
          <form onSubmit={createHook} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className={s.field}>
              <label className={s.fieldLabel} htmlFor="wh-url">Endpoint URL</label>
              <input
                id="wh-url"
                className={`${s.input} ${s.inputMono}`}
                placeholder="https://api.yourapp.com/webhooks/thesauros"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>
            <div className={s.field}>
              <label className={s.fieldLabel}>Events</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {WEBHOOK_EVENTS.map((ev) => {
                  const on = selEvents.includes(ev);
                  return (
                    <button
                      key={ev}
                      type="button"
                      onClick={() => toggleEvent(ev)}
                      className={s.badge}
                      style={{
                        cursor: 'pointer',
                        background: on ? 'var(--purple-dim)' : 'transparent',
                        color: on ? 'var(--purple)' : 'var(--ink-3)',
                        borderColor: on ? 'rgba(174,130,255,0.4)' : 'var(--stroke-strong)',
                        textTransform: 'none',
                        letterSpacing: 0,
                      }}
                    >
                      {ev}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className={s.row} style={{ justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={creating || !url}>
                {creating ? <Spinner /> : <IconWebhook size={14} />} Register
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
