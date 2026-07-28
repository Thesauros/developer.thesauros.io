'use client';

import { useCallback, useEffect, useState } from 'react';
import s from '../platform.module.css';
import { get, post, del, maskKey, timeAgo, BOOTSTRAP_KEY } from '../lib/api';
import { Badge, Modal, CopyButton, Empty, Spinner } from '../ui/primitives';
import { IconKey, IconPlus, IconTrash, IconShield } from '../lib/icons';

export default function ApiKeys({ apiKey, setApiKey }) {
  const [keys, setKeys] = useState(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [env, setEnv] = useState('test');
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState(null); // shown once after create
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    get('/keys', { key: apiKey })
      .then(({ data }) => setKeys(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function createKey(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { data } = await post('/keys', { label: label || 'Untitled key', environment: env }, { key: apiKey });
      setNewSecret(data);
      setLabel('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id) {
    setError(null);
    try {
      await del(`/keys/${id}`, { key: apiKey });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className={s.view}>
      <div className={s.row} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className={s.kicker}>Credentials</span>
          <h1 className={s.viewTitle}>API Keys</h1>
          <p className={s.viewLead}>
            Keys authenticate every request. Test keys hit the sandbox; live keys route production
            flow. Secrets are shown exactly once — store them in a secret manager.
          </p>
        </div>
        <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => { setNewSecret(null); setCreateOpen(true); }}>
          <IconPlus size={14} /> Create key
        </button>
      </div>

      {/* active key selector */}
      <div className={`${s.card} ${s.cardPad} ${s.revealItem}`} style={{ marginTop: 26, borderLeft: '3px solid var(--blue)' }}>
        <div className={s.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className={s.h3} style={{ fontSize: 13.5 }}>Portal session key</div>
            <div className={s.faint} style={{ fontSize: 12.5, marginTop: 3 }}>
              This key is used by the Try-it playground and dashboard calls on this page.
            </div>
          </div>
          <div className={s.row}>
            <code className={`${s.mono}`} style={{ fontSize: 12, color: 'var(--ink)' }}>{maskKey(apiKey)}</code>
            <CopyButton text={apiKey} label="Copy" />
            {apiKey !== BOOTSTRAP_KEY ? (
              <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setApiKey(BOOTSTRAP_KEY)}>
                Reset to sandbox
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div className={`${s.card} ${s.cardPad}`} style={{ marginTop: 16, color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <div className={`${s.card} ${s.revealItem}`} style={{ marginTop: 22, overflow: 'hidden' }}>
        <div className={s.panelHead}>
          <span className={s.h3}>All keys</span>
          <Badge tone="gray">{keys ? keys.length : 0} total</Badge>
        </div>
        {loading ? (
          <div className={s.empty}><Spinner /></div>
        ) : keys && keys.length ? (
          <table className={s.table}>
            <thead>
              <tr>
                <th>Label</th>
                <th>Secret</th>
                <th>Environment</th>
                <th>Created</th>
                <th>Last used</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className={s.strong}>{k.label}</td>
                  <td className={s.mono} style={{ fontSize: 12 }}>{maskKey(k.secret || k.prefix)}</td>
                  <td>
                    <Badge tone={k.environment === 'live' ? 'orange' : 'teal'}>{k.environment}</Badge>
                  </td>
                  <td className={s.faint} style={{ fontSize: 12.5 }}>{timeAgo(k.created_at)}</td>
                  <td className={s.faint} style={{ fontSize: 12.5 }}>{k.last_used_at ? timeAgo(k.last_used_at) : 'never'}</td>
                  <td>
                    {k.revoked ? <Badge tone="red">revoked</Badge> : <Badge tone="green" dot>active</Badge>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {!k.revoked && k.id !== 'key_bootstrap' ? (
                      <button type="button" className={`${s.btn} ${s.btnDanger} ${s.btnSm}`} onClick={() => revoke(k.id)}>
                        <IconTrash size={13} /> Revoke
                      </button>
                    ) : k.id === 'key_bootstrap' ? (
                      <span className={s.faint} style={{ fontSize: 11.5 }}>shared</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No keys yet. Create one to get started.</Empty>
        )}
      </div>

      <div className={`${s.card} ${s.cardPad} ${s.revealItem}`} style={{ marginTop: 22, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <IconShield size={18} style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 2 }} />
        <div>
          <div className={s.h3} style={{ fontSize: 13.5 }}>Scopes & rotation</div>
          <p className={s.faint} style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 4 }}>
            Every key is scoped: <code className={s.mono}>read</code> (GET),{' '}
            <code className={s.mono}>write</code> (positions &amp; webhooks) and{' '}
            <code className={s.mono}>keys:admin</code> (key management). Scopes are server-assigned — a
            key cannot grant itself broader access, and minting <code className={s.mono}>live</code> keys
            requires the <code className={s.mono}>keys:live</code> scope. Revocation is immediate: a
            revoked key returns <code className={s.mono}>401</code>, and an out-of-scope call returns{' '}
            <code className={s.mono}>403</code>.
          </p>
        </div>
      </div>

      {/* create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={newSecret ? 'Key created' : 'Create API key'}>
        {newSecret ? (
          <>
            <div className={`${s.card} ${s.cardPad}`} style={{ borderLeft: '3px solid var(--teal)', background: 'var(--bg-inset)' }}>
              <div className={s.h3} style={{ fontSize: 13 }}>Copy this secret now — it won’t be shown again</div>
              <code className={s.mono} style={{ display: 'block', marginTop: 10, fontSize: 12.5, wordBreak: 'break-all', color: 'var(--teal)' }}>
                {newSecret.secret}
              </code>
              <div className={s.row} style={{ marginTop: 12 }}>
                <CopyButton text={newSecret.secret} label="Copy secret" />
                <button
                  type="button"
                  className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                  onClick={() => { setApiKey(newSecret.secret); setCreateOpen(false); }}
                >
                  Use as portal key
                </button>
              </div>
            </div>
            <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => setCreateOpen(false)}>
              Done
            </button>
          </>
        ) : (
          <form onSubmit={createKey} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className={s.field}>
              <label className={s.fieldLabel} htmlFor="key-label">Label</label>
              <input
                id="key-label"
                className={s.input}
                placeholder="e.g. Production backend"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className={s.field}>
              <label className={s.fieldLabel}>Environment</label>
              <div className={s.envSwitch} style={{ maxWidth: 260 }}>
                <button type="button" className={`${s.envBtn} ${env === 'test' ? s.envBtnActive : ''}`} onClick={() => setEnv('test')}>Test</button>
                <button type="button" className={`${s.envBtn} ${env === 'live' ? s.envBtnActive : ''}`} onClick={() => setEnv('live')}>Live</button>
              </div>
            </div>
            <div className={s.row} style={{ justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={creating}>
                {creating ? <Spinner /> : <IconKey size={14} />} Create
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
