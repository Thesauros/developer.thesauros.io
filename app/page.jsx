'use client';

import { useCallback, useEffect, useState } from 'react';
import s from './platform.module.css';
import { BOOTSTRAP_KEY, maskKey } from './lib/api';
import {
  BrandMark,
  IconHome,
  IconBolt,
  IconBook,
  IconKey,
  IconWebhook,
  IconChart,
  IconVault,
  IconPulse,
  IconSearch,
  IconExternal,
  IconUsers,
  IconScale,
  IconSpark,
} from './lib/icons';
import Overview from './views/Overview';
import Quickstart from './views/Quickstart';
import ApiReference from './views/ApiReference';
import ApiKeys from './views/ApiKeys';
import Webhooks from './views/Webhooks';
import Usage from './views/Usage';
import Vaults from './views/Vaults';
import Status from './views/Status';
import Users from './views/Users';
import Reconciliation from './views/Reconciliation';
import Analytics from './views/Analytics';

const NAV_GROUPS = [
  {
    label: 'Get started',
    items: [
      { id: 'overview', label: 'Overview', icon: IconHome },
      { id: 'quickstart', label: 'Quickstart', icon: IconBolt },
    ],
  },
  {
    label: 'Build',
    items: [
      { id: 'reference', label: 'API Reference', icon: IconBook },
      { id: 'keys', label: 'API Keys', icon: IconKey },
      { id: 'users', label: 'Users', icon: IconUsers },
      { id: 'webhooks', label: 'Webhooks', icon: IconWebhook },
    ],
  },
  {
    label: 'Intelligence',
    items: [{ id: 'analytics', label: 'Analytics & Advisor', icon: IconSpark }],
  },
  {
    label: 'Operate',
    items: [
      { id: 'reconciliation', label: 'Reconciliation', icon: IconScale },
      { id: 'usage', label: 'Usage', icon: IconChart },
      { id: 'vaults', label: 'Vaults', icon: IconVault },
      { id: 'status', label: 'Status', icon: IconPulse },
    ],
  },
];

const VIEW_META = {
  overview: 'Overview',
  quickstart: 'Quickstart',
  reference: 'API Reference',
  keys: 'API Keys',
  users: 'Users',
  webhooks: 'Webhooks',
  analytics: 'Analytics & Advisor',
  reconciliation: 'Reconciliation',
  usage: 'Usage',
  vaults: 'Vaults',
  status: 'Status',
};

const STORAGE_KEY = 'thesauros.portal.key';

export default function PlatformPage() {
  const [view, setView] = useState('overview');
  const [env, setEnv] = useState('test');
  const [apiKey, setApiKeyState] = useState(BOOTSTRAP_KEY);

  // Restore a previously chosen portal key.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setApiKeyState(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const setApiKey = useCallback((k) => {
    setApiKeyState(k);
    try {
      window.localStorage.setItem(STORAGE_KEY, k);
    } catch {
      /* noop */
    }
  }, []);

  const go = useCallback((v) => {
    setView(v);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const viewProps = { go, apiKey, setApiKey };

  return (
    <div className={s.shell}>
      <div className={s.bg} aria-hidden="true" />
      <div className={s.layout}>
        {/* sidebar */}
        <aside className={s.sidebar}>
          <div className={s.brand}>
            <span className={s.brandMark}>
              <BrandMark size={18} />
            </span>
            <span>
              <span className={s.brandName}>Thesauros</span>
              <span className={s.brandSub}>Developers</span>
            </span>
          </div>

          {NAV_GROUPS.map((g) => (
            <nav key={g.label} className={s.navGroup} aria-label={g.label}>
              <div className={s.navLabel}>{g.label}</div>
              {g.items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`${s.navItem} ${view === it.id ? s.navItemActive : ''}`}
                  onClick={() => go(it.id)}
                  aria-current={view === it.id ? 'page' : undefined}
                >
                  <it.icon size={15} />
                  {it.label}
                  {it.id === 'status' ? <span className={s.navBadge}>live</span> : null}
                </button>
              ))}
            </nav>
          ))}

          <div className={s.sidebarFoot}>
            <div className={s.envSwitch} role="tablist" aria-label="Environment">
              <button type="button" role="tab" aria-selected={env === 'test'} className={`${s.envBtn} ${env === 'test' ? s.envBtnActive : ''}`} onClick={() => setEnv('test')}>
                Test
              </button>
              <button type="button" role="tab" aria-selected={env === 'live'} className={`${s.envBtn} ${env === 'live' ? s.envBtnActive : ''}`} onClick={() => setEnv('live')}>
                Live
              </button>
            </div>
            <button type="button" className={s.keyChip} onClick={() => go('keys')} title="Manage API keys">
              <span className={s.keyDot} aria-hidden="true" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {maskKey(apiKey)}
              </span>
            </button>
          </div>
        </aside>

        {/* main column */}
        <div className={s.main}>
          <header className={s.topbar}>
            <div className={s.crumb}>
              <span>Thesauros</span>
              <span className={s.crumbSep}>/</span>
              <span>Developers</span>
              <span className={s.crumbSep}>/</span>
              <span className={s.crumbCurrent}>{VIEW_META[view]}</span>
            </div>
            <div className={s.topRight}>
              <button type="button" className={s.searchHint} onClick={() => go('reference')}>
                <IconSearch size={13} />
                Search endpoints
                <span className={s.kbd}>⌘K</span>
              </button>
              <span className={s.statusPill}>
                <i aria-hidden="true" />
                {env === 'test' ? 'Sandbox' : 'Live'} · operational
              </span>
              <a className={s.btnGhost} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-2)', padding: '6px 8px', borderRadius: 8 }} href="/api/v1/openapi.json" target="_blank" rel="noreferrer">
                OpenAPI <IconExternal size={12} />
              </a>
            </div>
          </header>

          <div className={s.content}>
            {view === 'overview' ? <Overview {...viewProps} /> : null}
            {view === 'quickstart' ? <Quickstart {...viewProps} /> : null}
            {view === 'reference' ? <ApiReference {...viewProps} /> : null}
            {view === 'keys' ? <ApiKeys {...viewProps} /> : null}
            {view === 'users' ? <Users {...viewProps} /> : null}
            {view === 'webhooks' ? <Webhooks {...viewProps} /> : null}
            {view === 'analytics' ? <Analytics {...viewProps} /> : null}
            {view === 'reconciliation' ? <Reconciliation {...viewProps} /> : null}
            {view === 'usage' ? <Usage {...viewProps} /> : null}
            {view === 'vaults' ? <Vaults {...viewProps} /> : null}
            {view === 'status' ? <Status {...viewProps} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
