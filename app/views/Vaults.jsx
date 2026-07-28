'use client';

import { useEffect, useState } from 'react';
import s from '../platform.module.css';
import { get, fmtUsd, fmtApy } from '../lib/api';
import { Badge, Spinner, Empty } from '../ui/primitives';
import { BarList } from '../ui/charts';
import { IconVault, IconLayers } from '../lib/icons';

const RISK_TONE = { bluechip: 'teal', core: 'blue', opportunistic: 'orange' };
const PROVIDER_COLOR = {
  aave: '#3a7fff',
  morpho: '#ae82ff',
  compound: '#4dead8',
  dolomite: '#ffa24d',
  treasury: '#5fe082',
};

export default function Vaults({ apiKey }) {
  const [vaults, setVaults] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let alive = true;
    get('/vaults', { key: apiKey })
      .then(({ data }) => alive && setVaults(Array.isArray(data) ? data : []))
      .catch(() => alive && setVaults([]));
    return () => {
      alive = false;
    };
  }, [apiKey]);

  const list = (vaults || []).filter((v) => filter === 'all' || v.asset === filter);
  const totalTvl = (vaults || []).reduce((a, v) => a + (v.tvl_usd || 0), 0);

  const allocation = (vaults || [])
    .filter((v) => v.allocation_pct > 0)
    .sort((a, b) => b.allocation_pct - a.allocation_pct)
    .map((v) => ({
      label: `${v.name}`,
      value: v.allocation_pct,
      color: PROVIDER_COLOR[v.provider] || '#3a7fff',
    }));

  return (
    <div className={s.view}>
      <span className={s.kicker}>Network</span>
      <h1 className={s.viewTitle}>Vaults & strategies</h1>
      <p className={s.viewLead}>
        The yield venues the router allocates across. APYs are live; allocation reflects the
        current routing decision. Paused vaults are excluded from new flow automatically.
      </p>

      <div className={s.row} style={{ marginTop: 22, gap: 8 }}>
        {['all', 'USDC', 'USDT'].map((f) => (
          <button key={f} type="button" className={`${s.codeTab} ${filter === f ? s.codeTabActive : ''}`} style={{ border: '1px solid var(--stroke)', borderRadius: 8 }} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All assets' : f}
          </button>
        ))}
        <span className={s.faint} style={{ fontSize: 12.5, marginLeft: 'auto' }}>
          Total TVL <span className={s.mono} style={{ color: 'var(--ink)' }}>{fmtUsd(totalTvl, { compact: true })}</span>
        </span>
      </div>

      <div className={`${s.card} ${s.revealItem}`} style={{ marginTop: 18, overflow: 'hidden' }}>
        {!vaults ? (
          <div className={s.empty}><Spinner /></div>
        ) : list.length ? (
          <table className={s.table}>
            <thead>
              <tr>
                <th>Vault</th>
                <th>Provider</th>
                <th>Chain</th>
                <th>Asset</th>
                <th>APY</th>
                <th>7d avg</th>
                <th>TVL</th>
                <th>Risk tier</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.id}>
                  <td>
                    <div className={s.row} style={{ gap: 10 }}>
                      <span
                        style={{
                          width: 28, height: 28, borderRadius: 7, display: 'grid', placeItems: 'center',
                          background: `color-mix(in srgb, ${PROVIDER_COLOR[v.provider] || '#3a7fff'} 16%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${PROVIDER_COLOR[v.provider] || '#3a7fff'} 40%, transparent)`,
                          flexShrink: 0,
                        }}
                      >
                        <IconVault size={14} style={{ color: PROVIDER_COLOR[v.provider] || '#3a7fff' }} />
                      </span>
                      <span className={s.strong}>{v.name}</span>
                    </div>
                  </td>
                  <td className={s.mono} style={{ fontSize: 12, textTransform: 'capitalize' }}>{v.provider}</td>
                  <td><Badge tone="gray">{v.chain}</Badge></td>
                  <td className={s.strong}>{v.asset}</td>
                  <td className={`${s.num} ${s.pos}`}>{fmtApy(v.apy)}</td>
                  <td className={s.num}>{fmtApy(v.apy_7d_avg)}</td>
                  <td className={s.num}>{fmtUsd(v.tvl_usd, { compact: true })}</td>
                  <td><Badge tone={RISK_TONE[v.risk_tier] || 'gray'}>{v.risk_tier}</Badge></td>
                  <td>{v.status === 'active' ? <Badge tone="green" dot>active</Badge> : <Badge tone="orange">paused</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No vaults match this filter.</Empty>
        )}
      </div>

      <div className={s.grid2} style={{ marginTop: 24 }}>
        <div className={`${s.card} ${s.cardPad} ${s.revealItem}`}>
          <div className={s.row} style={{ justifyContent: 'space-between', marginBottom: 18 }}>
            <span className={s.h3}>Current router allocation</span>
            <IconLayers size={16} style={{ color: 'var(--purple)' }} />
          </div>
          {allocation.length ? (
            <BarList items={allocation} fmt={(v) => `${(v * 100).toFixed(1)}%`} />
          ) : (
            <div className={s.faint} style={{ fontSize: 13 }}>No active allocation.</div>
          )}
        </div>

        <div className={`${s.card} ${s.cardPad} ${s.revealItem}`} style={{ animationDelay: '60ms' }}>
          <div className={s.h3} style={{ marginBottom: 14 }}>How routing decides</div>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['Risk-adjusted yield', 'APY is weighted by venue risk tier and liquidity depth, not raw rate.'],
              ['Capacity awareness', 'Deposits respect per-vault capacity to avoid slippage and rate dilution.'],
              ['Diversification floor', 'Exposure to any single protocol is capped to limit contagion risk.'],
              ['Continuous rebalance', 'Positions shift as rates move; every move is logged and queryable.'],
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
