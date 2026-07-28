'use client';

import { useCallback, useEffect, useState } from 'react';
import s from '../platform.module.css';
import { get, post, timeAgo, shortAddr, fmtUsd, fmtApy } from '../lib/api';
import { Badge, Modal, Empty, Spinner } from '../ui/primitives';
import { IconUsers, IconPlus, IconArrowRight } from '../lib/icons';

export default function Users({ apiKey }) {
  const [users, setUsers] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null); // { positions, ledger }
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ external_id: '', label: '', email: '', wallets: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    get('/users?limit=100', { key: apiKey })
      .then(({ data }) => setUsers(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message));
  }, [apiKey]);

  useEffect(() => {
    load();
  }, [load]);

  const openUser = useCallback(
    async (user) => {
      setSelected(user);
      setDetail(null);
      try {
        const [pos, led] = await Promise.all([
          get(`/users/${user.id}/positions`, { key: apiKey }).then((r) => r.data),
          get(`/users/${user.id}/ledger?limit=50`, { key: apiKey }).then((r) => r.data),
        ]);
        setDetail({ positions: pos, ledger: led });
      } catch (e) {
        setError(e.message);
      }
    },
    [apiKey],
  );

  async function createUser(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const wallets = form.wallets
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean);
      await post(
        '/users',
        {
          external_id: form.external_id.trim(),
          label: form.label.trim() || null,
          email: form.email.trim() || null,
          wallets,
        },
        { key: apiKey },
      );
      setCreateOpen(false);
      setForm({ external_id: '', label: '', email: '', wallets: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const totalValue = detail
    ? detail.positions.reduce((sum, p) => sum + (p.current_value || 0), 0)
    : 0;

  return (
    <div className={s.view}>
      <div className={s.row} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className={s.kicker}>Identity</span>
          <h1 className={s.viewTitle}>Users</h1>
          <p className={s.viewLead}>
            Your customers, mapped to Thesauros via <code className={s.mono}>external_id</code>. Link
            their wallets, then query positions and the reconciliation ledger per user.
          </p>
        </div>
        <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => setCreateOpen(true)}>
          <IconPlus size={14} /> Create user
        </button>
      </div>

      {error ? (
        <div className={`${s.card} ${s.cardPad}`} style={{ marginTop: 16, color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(0,5fr) minmax(0,7fr)' : '1fr', gap: 18, marginTop: 24 }}>
        {/* users list */}
        <div className={`${s.card} ${s.revealItem}`} style={{ overflow: 'hidden' }}>
          <div className={s.panelHead}>
            <span className={s.h3}>End-users</span>
            <Badge tone="gray">{users ? users.length : 0}</Badge>
          </div>
          {!users ? (
            <div className={s.empty}><Spinner /></div>
          ) : users.length ? (
            <table className={s.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>External ID</th>
                  <th>Wallets</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => openUser(u)}
                    style={{ cursor: 'pointer', background: selected && selected.id === u.id ? 'rgba(58,127,255,0.10)' : undefined }}
                  >
                    <td>
                      <div className={s.strong} style={{ fontSize: 13 }}>{u.label || '—'}</div>
                      <div className={`${s.mono} ${s.faint}`} style={{ fontSize: 11 }}>{u.id}</div>
                    </td>
                    <td className={`${s.mono}`} style={{ fontSize: 12 }}>{u.external_id}</td>
                    <td className={`${s.mono} ${s.faint}`} style={{ fontSize: 11.5 }}>
                      {(u.wallets || []).length ? shortAddr(u.wallets[0]) : '—'}
                      {(u.wallets || []).length > 1 ? ` +${u.wallets.length - 1}` : ''}
                    </td>
                    <td>{u.status === 'active' ? <Badge tone="green" dot>active</Badge> : <Badge tone="gray">disabled</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>No users yet. Create one to map your first customer.</Empty>
          )}
        </div>

        {/* detail */}
        {selected ? (
          <div className={`${s.card} ${s.revealItem}`} style={{ overflow: 'hidden', animationDelay: '60ms' }}>
            <div className={s.panelHead}>
              <div className={s.row}>
                <IconUsers size={16} style={{ color: 'var(--blue-strong)' }} />
                <span className={s.h3}>{selected.label || selected.id}</span>
              </div>
              <Badge tone="blue">{fmtUsd(totalValue, { compact: true })}</Badge>
            </div>

            <div className={s.cardPad} style={{ borderBottom: '1px solid var(--stroke)' }}>
              <div className={s.row} style={{ flexWrap: 'wrap', gap: 18, fontSize: 12.5 }}>
                <span className={s.faint}>External ID <span className={`${s.mono} ${s.strong}`}>{selected.external_id}</span></span>
                {selected.email ? <span className={s.faint}>Email <span className={s.strong}>{selected.email}</span></span> : null}
                <span className={s.faint}>Created <span className={s.strong}>{timeAgo(selected.created_at)}</span></span>
              </div>
              <div className={s.row} style={{ flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {(selected.wallets || []).map((w) => (
                  <span key={w} className={`${s.badge} ${s.bGray}`} style={{ textTransform: 'none', letterSpacing: 0 }}>
                    <span className={s.mono}>{shortAddr(w)}</span>
                  </span>
                ))}
              </div>
            </div>

            {!detail ? (
              <div className={s.empty}><Spinner /></div>
            ) : (
              <>
                <div className={s.panelHead}>
                  <span className={s.h3} style={{ fontSize: 13 }}>Positions</span>
                  <Badge tone="gray">{detail.positions.length}</Badge>
                </div>
                {detail.positions.length ? (
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Vault</th>
                        <th>APY</th>
                        <th>Value</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.positions.map((p) => (
                        <tr key={p.id}>
                          <td className={s.strong}>{p.asset}</td>
                          <td className={`${s.mono} ${s.faint}`} style={{ fontSize: 11.5 }}>{shortAddr(p.vault_id)}</td>
                          <td className={`${s.num} ${s.pos}`}>{fmtApy(p.apy)}</td>
                          <td className={s.num}>{fmtUsd(p.current_value)}</td>
                          <td>{p.status === 'active' ? <Badge tone="green" dot>active</Badge> : <Badge tone="gray">closed</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className={s.empty}>No positions for this user.</div>
                )}

                <div className={s.panelHead}>
                  <span className={s.h3} style={{ fontSize: 13 }}>Ledger</span>
                  <Badge tone="gray">{detail.ledger.length}</Badge>
                </div>
                {detail.ledger.length ? (
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Balance</th>
                        <th>Settled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.ledger.map((e) => (
                        <tr key={e.id}>
                          <td className={`${s.mono} ${s.faint}`} style={{ fontSize: 11.5 }}>{timeAgo(e.at)}</td>
                          <td><Badge tone={e.type === 'accrual' ? 'purple' : e.type === 'deposit' ? 'teal' : 'orange'}>{e.type}</Badge></td>
                          <td className={s.num} style={{ color: e.amount >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {e.amount >= 0 ? '+' : ''}{fmtUsd(e.amount)}
                          </td>
                          <td className={s.num}>{fmtUsd(e.balance_after)}</td>
                          <td>{e.settled ? <Badge tone="green">settled</Badge> : <Badge tone="orange">unsettled</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className={s.empty}>No ledger activity.</div>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create end-user">
        <form onSubmit={createUser} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className={s.field}>
            <label className={s.fieldLabel} htmlFor="u-ext">External ID (your customer id)</label>
            <input id="u-ext" className={`${s.input} ${s.inputMono}`} value={form.external_id} onChange={(e) => setForm({ ...form, external_id: e.target.value })} placeholder="partner-user-2001" required />
          </div>
          <div className={s.field}>
            <label className={s.fieldLabel} htmlFor="u-label">Label</label>
            <input id="u-label" className={s.input} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Acme Corp Treasury" />
          </div>
          <div className={s.field}>
            <label className={s.fieldLabel} htmlFor="u-email">Email</label>
            <input id="u-email" className={s.input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="treasury@acme.com" />
          </div>
          <div className={s.field}>
            <label className={s.fieldLabel} htmlFor="u-wallets">Wallets (comma-separated)</label>
            <input id="u-wallets" className={`${s.input} ${s.inputMono}`} value={form.wallets} onChange={(e) => setForm({ ...form, wallets: e.target.value })} placeholder="0x8b3E..., 0x1b2C..." />
          </div>
          <div className={s.row} style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={saving}>
              {saving ? <Spinner /> : <IconArrowRight size={14} />} Create
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
