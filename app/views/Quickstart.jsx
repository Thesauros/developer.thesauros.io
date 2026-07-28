'use client';

import { useState } from 'react';
import s from '../platform.module.css';
import { CodeBlock, Badge, CopyButton } from '../ui/primitives';
import { BOOTSTRAP_KEY } from '../lib/api';
import {
  QUICKSTART_INSTALL,
  QUICKSTART_INIT,
  QUICKSTART_DEPOSIT,
  QUICKSTART_MONITOR,
} from '../data/code';
import { IconArrowRight, IconCheck, IconKey } from '../lib/icons';

const LANGS = [
  { id: 'ts', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'curl', label: 'cURL' },
];

function LangTabs({ lang, setLang }) {
  return (
    <div className={s.codeTabs} role="tablist" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          role="tab"
          aria-selected={lang === l.id}
          className={`${s.codeTab} ${lang === l.id ? s.codeTabActive : ''}`}
          onClick={() => setLang(l.id)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

function Step({ n, title, desc, children, delay }) {
  return (
    <div className={s.revealItem} style={{ animationDelay: `${delay}ms`, display: 'grid', gridTemplateColumns: '52px 1fr', gap: 18 }}>
      <div>
        <div
          className={s.mono}
          style={{
            width: 40,
            height: 40,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 10,
            border: '1px solid rgba(91,149,255,0.35)',
            background: 'var(--blue-dim)',
            color: 'var(--blue-strong)',
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          {n}
        </div>
      </div>
      <div style={{ minWidth: 0, paddingBottom: 34 }}>
        <h3 className={s.h2} style={{ fontSize: 18 }}>{title}</h3>
        <p className={s.faint} style={{ marginTop: 6, marginBottom: 16, fontSize: 13.5, lineHeight: 1.6, maxWidth: 620 }}>
          {desc}
        </p>
        {children}
      </div>
    </div>
  );
}

export default function Quickstart({ go }) {
  const [lang, setLang] = useState('ts');

  return (
    <div className={s.view}>
      <span className={s.kicker}>Quickstart</span>
      <h1 className={s.viewTitle}>First yield position in 5 minutes</h1>
      <p className={s.viewLead}>
        Everything below runs against the live sandbox — no account, no contract deployment. The
        requests you see are the exact ones the SDK makes for you.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '22px 0 30px' }}>
        <LangTabs lang={lang} setLang={setLang} />
        <span className={s.faint} style={{ fontSize: 12.5 }}>
          Sandbox key is pre-filled.{' '}
          <button type="button" className={s.btnGhost} style={{ minHeight: 'auto', padding: '0 4px', color: 'var(--blue-strong)' }} onClick={() => go('keys')}>
            Create your own →
          </button>
        </span>
      </div>

      {/* sandbox key callout */}
      <div
        className={`${s.card} ${s.cardPad} ${s.revealItem}`}
        style={{ display: 'flex', alignItems: 'center', gap: 14, borderLeft: '3px solid var(--teal)', marginBottom: 34 }}
      >
        <IconKey size={18} style={{ color: 'var(--teal)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={s.h3} style={{ fontSize: 13.5 }}>Shared sandbox key</div>
          <div className={`${s.mono} ${s.faint}`} style={{ fontSize: 12, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {BOOTSTRAP_KEY}
          </div>
        </div>
        <CopyButton text={BOOTSTRAP_KEY} label="Copy key" />
        <Badge tone="teal">test mode</Badge>
      </div>

      <Step
        n="1"
        title="Install the SDK"
        desc="Typed clients for TypeScript and Python, or hit the REST API directly. Zero runtime dependencies."
        delay={40}
      >
        <CodeBlock {...QUICKSTART_INSTALL[lang]} />
      </Step>

      <Step
        n="2"
        title="Initialize the client"
        desc="Authenticate with your API key. Test keys (tsk_test_) and live keys (tsk_live_) are both accepted; live keys carry a higher rate ceiling. In this sandbox both run the same deterministic simulation — no real funds move."
        delay={90}
      >
        <CodeBlock {...QUICKSTART_INIT[lang]} />
      </Step>

      <Step
        n="3"
        title="Open a yield position"
        desc="One call deposits from your user's wallet into the optimal venue. Non-custodial — the user signs, you never hold funds."
        delay={140}
      >
        <CodeBlock {...QUICKSTART_DEPOSIT[lang]} />
      </Step>

      <Step
        n="4"
        title="Monitor and rebalance"
        desc="Value accrues continuously. The router rebalances automatically and you can observe every decision."
        delay={190}
      >
        <CodeBlock {...QUICKSTART_MONITOR[lang]} />
      </Step>

      <div
        className={`${s.card} ${s.cardPad} ${s.revealItem}`}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: 'linear-gradient(120deg, rgba(58,127,255,0.10), rgba(77,234,216,0.06))' }}
      >
        <div>
          <div className={s.h3}>Ready for the full surface?</div>
          <div className={s.faint} style={{ fontSize: 13, marginTop: 4 }}>
            Explore every endpoint with live Try-it, or wire up signed webhooks.
          </div>
        </div>
        <div className={s.row}>
          <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => go('reference')}>
            API Reference <IconArrowRight size={14} />
          </button>
          <button type="button" className={`${s.btn} ${s.btnSecondary}`} onClick={() => go('webhooks')}>
            Webhooks
          </button>
        </div>
      </div>
    </div>
  );
}
