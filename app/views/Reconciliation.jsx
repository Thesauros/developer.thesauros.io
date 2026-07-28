'use client';

import { useEffect, useState } from 'react';
import s from '../platform.module.css';
import { get, fmtUsd, timeAgo, shortAddr } from '../lib/api';
import { Badge, Empty, Spinner } from '../ui/primitives';
import { LineChart } from '../ui/charts';
import { IconScale, IconCheck, IconRefresh } from '../lib/icons';

const LEDGER_TONES = { deposit: 'teal', withdraw: 'orange', close: 'red', accrual: 'purple' };

export default function Reconciliation({ apiKey }) {
  const [report, setReport] = useState(null);
  const [balances, setBalances] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [snaps, setSnaps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      get('/reconciliation/report', { key: apiKey }).then((r) => r.data).catch(() => null),
      get('/reconciliation/balances', { key: apiKey }).then((r) => r.data).catch(() => []),
      get('/reconciliation/ledger?limit=100', { key: apiKey }).then((r) => r.data).catch(() => []),
      get('/reconciliation/snapshots', { key: apiKey }).then((r) => r.data).catch(() => []),
    ])
      .then(([rep, bal, led, sn]) => {
        if (!alive) return;
        setReport(rep);
        setBalances(bal);
        setLedger(led);
        setSnaps(sn);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [apiKey]);

  const reload = () => {
    setLoading(true);
    Promise.all([
      get('/reconciliation/report', { key: apiKey }).then((r) => r.data).catch(() => null),
      get('/reconciliation/balances', { key: apiKey }).then((r) => r.data).catch(() => []),
      get('/reconciliation/ledger?limit=100', { key: apiKey }).then((r) => r.data).catch(() => []),
      get('/reconciliation/snapshots', { key: apiKey }).then((r) => r.data).catch(() => []),
    ]).then(([rep, bal, led, sn]) => {
      setReport(rep);
      setBalances(bal);
      setLedger(led);
      setSnaps(sn);
      setLoading(false);
    });
  };

  const reconciled = report && report.status === 'reconciled';
  const filteredLedger = (ledger || []).filter((e) => !typeFilter || e.type === typeFilter);
  const snapLabels = (snaps || []).map((sn) => sn.date.slice(5));

  return (
    <div className={s.view}>
      <div className={s.row} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className={s.kicker}>Accounting</span>
          <h1 className={s.viewTitle}>Reconciliation</h1>
          <p className={s.viewLead}>
            Match the recorded ledger against on-chain state. The report explains any difference as
            intraday unsettled yield; balances and daily snapshots feed your period accounting.
          </p>
        </div>
        <button type="button" className={`${s.btn} ${s.btnSecondary}`} onClick={reload}>
          <IconRefresh size={14} /> Refresh
        </button>
      </div>

      {/* report banner */}
      {report ? (
        <div
          className={`${s.card} ${s.cardPad} ${s.revealItem}`}
          style={{
            marginTop: 24,
            borderLeft: `3px solid ${reconciled ? 'var(--teal)' : 'var(--red)'}`,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: 20,
            alignItems: 'center',
          }}
        >
          <span
            style={{
              width: 52, height: 52, borderRadius: 13, display: 'grid', placeItems: 'center',
              background: reconciled ? 'var(--teal-dim)' : 'var(--red-dim)',
              border: `1px solid ${reconciled ? 'rgba(77,234,216,0.35)' : 'rgba(255,107,107,0.35)'}`,
            }}
          >
            <IconScale size={24} style={{ color: reconciled ? 'var(--teal)' : 'var(--red)' }} />
          </span>
          <div>
            <div className={s.row} style={{ gap: 12 }}>
              <span className={s.h2} style={{ fontSize: 20 }}>
                {reconciled ? 'Reconciled' : 'Mismatch detected'}
              </span>
              <Badge tone={reconciled ? 'teal' : 'red'} dot>{report.status}</Badge>
            </div>
            <div className={s.faint} style={{ fontSize: 12.5, marginTop: 4 }}>
              As of {timeAgo(report.as_of)} · {report.positions} positions · tolerance {fmtUsd(report.tolerance)}
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className={s.empty}><Spinner /></div>
      ) : null}

      {/* report figures */}
      {report ? (
        <div className={s.statGrid} style={{ marginTop: 16 }}>
          {[
            { label: 'Recorded (ledger)', value: fmtUsd(report.recorded_total), tone: 'var(--ink)' },
            { label: 'On-chain (settled)', value: fmtUsd(report.onchain_total), tone: 'var(--blue-strong)' },
            { label: 'Discrepancy', value: fmtUsd(report.discrepancy), tone: reconciled ? 'var(--green)' : 'var(--red)' },
            { label: 'Unsettled yield', value: fmtUsd(report.unsettled_yield), tone: 'var(--orange)' },
          ].map((st, i) => (
            <div key={st.label} className={`${s.card} ${s.stat} ${s.revealItem}`} style={{ animationDelay: `${i * 50}ms` }}>
              <div className={s.statLabel}>{st.label}</div>
              <div className={s.statValue} style={{ color: st.tone, fontSize: 22 }}>{st.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* breakdown + balances */}
      <div className={s.grid2} style={{ marginTop: 22 }}>
        <div className={`${s.card} ${s.revealItem}`} style={{ overflow: 'hidden' }}>
          <div className={s.panelHead}>
            <span className={s.h3}>Reconciliation by asset</span>
          </div>
          {report && report.breakdown.length ? (
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Recorded</th>
                  <th>On-chain</th>
                  <th>Diff</th>
                </tr>
              </thead>
              <tbody>
                {report.breakdown.map((b) => (
                  <tr key={b.asset}>
                    <td className={s.strong}>{b.asset}</td>
                    <td className={s.num}>{fmtUsd(b.recorded)}</td>
                    <td className={s.num}>{fmtUsd(b.onchain)}</td>
                    <td className={s.num} style={{ color: Math.abs(b.discrepancy) < 0.005 ? 'var(--green)' : 'var(--orange)' }}>
                      {fmtUsd(b.discrepancy)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={s.empty}>No data.</div>
          )}
        </div>

        <div className={`${s.card} ${s.revealItem}`} style={{ overflow: 'hidden', animationDelay: '60ms' }}>
          <div className={s.panelHead}>
            <span className={s.h3}>Balances by user</span>
          </div>
          {balances && balances.length ? (
            <table className={s.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Asset</th>
                  <th>Principal</th>
                  <th>Value</th>
                  <th>Yield</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b, i) => (
                  <tr key={i}>
                    <td className={`${s.mono} ${s.strong}`} style={{ fontSize: 11.5 }}>{b.user_id ? shortAddr(b.user_id) : 'unassigned'}</td>
                    <td className={s.strong}>{b.asset}</td>
                    <td className={s.num}>{fmtUsd(b.principal)}</td>
                    <td className={s.num}>{fmtUsd(b.current_value)}</td>
                    <td className={`${s.num} ${s.pos}`}>+{fmtUsd(b.accrued_yield)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={s.empty}>No active balances.</div>
          )}
        </div>
      </div>

      {/* snapshots chart */}
      <div className={`${s.card} ${s.revealItem}`} style={{ marginTop: 22, overflow: 'hidden' }}>
        <div className={s.panelHead}>
          <span className={s.h3}>Balance snapshots (30d)</span>
          <Badge tone="teal" dot>daily</Badge>
        </div>
        <div style={{ padding: '16px 18px 8px' }}>
          {snaps && snaps.length ? (
            <LineChart
              series={[
                { label: 'value', color: '#4dead8', values: snaps.map((sn) => sn.value) },
                { label: 'principal', color: '#3a7fff', values: snaps.map((sn) => sn.principal), fill: false },
              ]}
              labels={snapLabels}
              yFmt={(v) => fmtUsd(v, { compact: true })}
            />
          ) : (
            <div className={s.empty}>No snapshots.</div>
          )}
        </div>
      </div>

      {/* ledger */}
      <div className={`${s.card} ${s.revealItem}`} style={{ marginTop: 22, overflow: 'hidden' }}>
        <div className={s.panelHead}>
          <span className={s.h3}>Ledger</span>
          <div className={s.row} style={{ gap: 6 }}>
            {['', 'deposit', 'withdraw', 'accrual', 'close'].map((t) => (
              <button
                key={t || 'all'}
                type="button"
                className={`${s.codeTab} ${typeFilter === t ? s.codeTabActive : ''}`}
                style={{ padding: '4px 10px', fontSize: 11 }}
                onClick={() => setTypeFilter(t)}
              >
                {t || 'all'}
              </button>
            ))}
          </div>
        </div>
        {filteredLedger.length ? (
          <table className={s.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Position</th>
                <th>Asset</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Balance</th>
                <th>Settled</th>
              </tr>
            </thead>
            <tbody>
              {filteredLedger.map((e) => (
                <tr key={e.id}>
                  <td className={`${s.mono} ${s.faint}`} style={{ fontSize: 11.5 }}>{timeAgo(e.at)}</td>
                  <td className={`${s.mono} ${s.faint}`} style={{ fontSize: 11 }}>{e.user_id ? shortAddr(e.user_id) : '—'}</td>
                  <td className={`${s.mono} ${s.faint}`} style={{ fontSize: 11 }}>{shortAddr(e.position_id)}</td>
                  <td className={s.strong}>{e.asset}</td>
                  <td><Badge tone={LEDGER_TONES[e.type] || 'gray'}>{e.type}</Badge></td>
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
          <Empty>No ledger entries match this filter.</Empty>
        )}
      </div>
    </div>
  );
}
