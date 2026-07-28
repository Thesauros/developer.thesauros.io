'use client';

import { useMemo, useState } from 'react';
import s from '../platform.module.css';
import { api, BASE } from '../lib/api';
import { Badge, MethodBadge, CopyButton } from '../ui/primitives';
import { ENDPOINT_GROUPS, findEndpoint } from '../data/endpoints';
import { IconSend, IconChevronDown, IconCheck } from '../lib/icons';

function buildUrl(endpoint, values) {
  let path = endpoint.path;
  for (const p of endpoint.params) {
    if (p.in === 'path') {
      path = path.replace(`:${p.name}`, encodeURIComponent(values[p.name] || p.example || ''));
    }
  }
  const qs = new URLSearchParams();
  for (const p of endpoint.params) {
    if (p.in === 'query' && values[p.name]) qs.set(p.name, values[p.name]);
  }
  const q = qs.toString();
  return { path, full: `${BASE}${path}${q ? `?${q}` : ''}` };
}

function buildBody(endpoint, values) {
  const bodyParams = endpoint.params.filter((p) => p.in === 'body');
  if (!bodyParams.length) return undefined;
  const body = {};
  for (const p of bodyParams) {
    let v = values[p.name];
    if (v === undefined || v === '') continue;
    if (p.type === 'number') v = Number(v);
    if (p.type === 'boolean') v = v === 'true' || v === true;
    if (p.type === 'array') v = String(v).split(',').map((x) => x.trim()).filter(Boolean);
    body[p.name] = v;
  }
  return body;
}

function ParamInput({ p, value, onChange }) {
  const base = `${s.input} ${s.inputMono}`;
  if (p.in === 'body' && p.type === 'array') {
    return (
      <input
        className={base}
        value={value ?? ''}
        placeholder={p.example}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (p.type === 'enum' && p.options) {
    return (
      <select className={`${s.select} ${s.inputMono}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {p.options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }
  if (p.type === 'boolean') {
    return (
      <select className={`${s.select} ${s.inputMono}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  return (
    <input
      className={base}
      value={value ?? ''}
      placeholder={p.example || p.name}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function TryIt({ endpoint, apiKey }) {
  const [values, setValues] = useState({});
  const [state, setState] = useState({ status: 'idle' }); // idle | loading | done | error
  const [result, setResult] = useState(null);

  const set = (name) => (v) => setValues((prev) => ({ ...prev, [name]: v }));

  const { full } = useMemo(() => buildUrl(endpoint, values), [endpoint, values]);

  async function send() {
    setState({ status: 'loading' });
    const { path } = buildUrl(endpoint, values);
    const qs = new URLSearchParams();
    endpoint.params.filter((p) => p.in === 'query' && values[p.name]).forEach((p) => qs.set(p.name, values[p.name]));
    const q = qs.toString();
    const body = buildBody(endpoint, values);
    const t0 = performance.now();
    try {
      const res = await fetch(`${BASE}${path}${q ? `?${q}` : ''}`, {
        method: endpoint.method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
      const ms = Math.max(1, Math.round(performance.now() - t0));
      let json = null;
      try {
        json = await res.json();
      } catch {
        /* */
      }
      setResult({
        ok: res.ok,
        status: res.status,
        ms,
        requestId: res.headers.get('x-request-id'),
        rateRemaining: res.headers.get('x-ratelimit-remaining'),
        body: json,
      });
      setState({ status: 'done' });
    } catch (err) {
      setResult({ ok: false, status: 0, ms: 0, body: { error: { code: 'network', message: String(err) } } });
      setState({ status: 'error' });
    }
  }

  const pathParams = endpoint.params.filter((p) => p.in === 'path');
  const queryParams = endpoint.params.filter((p) => p.in === 'query');
  const bodyParams = endpoint.params.filter((p) => p.in === 'body');

  return (
    <div className={s.card} style={{ overflow: 'hidden' }}>
      <div className={s.panelHead}>
        <div className={s.row}>
          <MethodBadge method={endpoint.method} />
          <span className={`${s.mono} ${s.h3}`} style={{ fontSize: 13 }}>{endpoint.path}</span>
        </div>
        <Badge tone="teal" dot>sandbox</Badge>
      </div>

      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {pathParams.length ? (
          <div>
            <div className={s.statLabel} style={{ marginBottom: 8 }}>Path parameters</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {pathParams.map((p) => (
                <div key={p.name} className={s.field}>
                  <label className={s.fieldLabel}>
                    <span className={s.mono}>{p.name}</span> {p.required ? <span style={{ color: 'var(--red)' }}>*</span> : null}
                  </label>
                  <ParamInput p={p} value={values[p.name]} onChange={set(p.name)} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {queryParams.length ? (
          <div>
            <div className={s.statLabel} style={{ marginBottom: 8 }}>Query parameters</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {queryParams.map((p) => (
                <div key={p.name} className={s.field}>
                  <label className={s.fieldLabel}>
                    <span className={s.mono}>{p.name}</span>
                  </label>
                  <ParamInput p={p} value={values[p.name]} onChange={set(p.name)} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {bodyParams.length ? (
          <div>
            <div className={s.statLabel} style={{ marginBottom: 8 }}>Body</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {bodyParams.map((p) => (
                <div key={p.name} className={s.field}>
                  <label className={s.fieldLabel}>
                    <span className={s.mono}>{p.name}</span> {p.required ? <span style={{ color: 'var(--red)' }}>*</span> : null}
                  </label>
                  <ParamInput p={p} value={values[p.name]} onChange={set(p.name)} />
                  <span className={s.faint} style={{ fontSize: 11.5 }}>{p.desc}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className={s.row} style={{ justifyContent: 'space-between' }}>
          <code className={`${s.mono} ${s.faint}`} style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
            {endpoint.method} {full}
          </code>
          <button
            type="button"
            className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`}
            onClick={send}
            disabled={state.status === 'loading'}
          >
            {state.status === 'loading' ? <span className={s.spinner} /> : <IconSend size={13} />}
            Send
          </button>
        </div>

        {result ? (
          <div style={{ borderTop: '1px solid var(--stroke)', paddingTop: 14 }}>
            <div className={s.row} style={{ marginBottom: 10, flexWrap: 'wrap' }}>
              <Badge tone={result.ok ? 'green' : 'red'}>{result.status || 'ERR'}</Badge>
              <span className={`${s.mono} ${s.faint}`} style={{ fontSize: 11.5 }}>{result.ms}ms</span>
              {result.requestId ? (
                <span className={`${s.mono} ${s.faint}`} style={{ fontSize: 11.5 }}>req {String(result.requestId).slice(0, 8)}</span>
              ) : null}
              {result.rateRemaining ? (
                <span className={`${s.mono} ${s.faint}`} style={{ fontSize: 11.5 }}>rate {result.rateRemaining} left</span>
              ) : null}
            </div>
            <pre
              className={s.mono}
              style={{
                fontSize: 11.5,
                lineHeight: 1.65,
                color: result.ok ? '#c3cee2' : 'var(--red)',
                background: 'var(--bg-inset)',
                border: '1px solid var(--stroke)',
                borderRadius: 8,
                padding: 14,
                overflow: 'auto',
                maxHeight: 320,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {JSON.stringify(result.body, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ApiReference({ apiKey }) {
  const [selectedId, setSelectedId] = useState('create-position');
  const [openGroups, setOpenGroups] = useState(() => new Set(ENDPOINT_GROUPS.map((g) => g.id)));
  const found = findEndpoint(selectedId);
  const endpoint = found ? found.endpoint : ENDPOINT_GROUPS[0].endpoints[0];

  const toggleGroup = (id) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className={s.view}>
      <span className={s.kicker}>API Reference</span>
      <h1 className={s.viewTitle}>REST API v1</h1>
      <p className={s.viewLead}>
        Every endpoint is live in the sandbox. Fill parameters, hit Send, and inspect the real
        response — including rate-limit headers and request ids.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 26, marginTop: 30, alignItems: 'start' }}>
        {/* endpoint nav */}
        <aside className={s.card} style={{ position: 'sticky', top: 76, overflow: 'hidden' }}>
          <div style={{ padding: '8px 0', maxHeight: '70vh', overflowY: 'auto' }}>
            {ENDPOINT_GROUPS.map((g) => (
              <div key={g.id}>
                <button
                  type="button"
                  className={s.navItem}
                  style={{ fontWeight: 600, fontSize: 12.5 }}
                  onClick={() => toggleGroup(g.id)}
                >
                  <IconChevronDown
                    size={13}
                    style={{ transform: openGroups.has(g.id) ? 'none' : 'rotate(-90deg)', transition: 'transform 0.18s' }}
                  />
                  {g.label}
                </button>
                {openGroups.has(g.id) ? (
                  <div style={{ padding: '2px 0 6px 8px' }}>
                    {g.endpoints.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        className={`${s.navItem} ${e.id === endpoint.id ? s.navItemActive : ''}`}
                        style={{ fontSize: 12.5, padding: '6px 10px' }}
                        onClick={() => setSelectedId(e.id)}
                      >
                        <MethodBadge method={e.method} />
                        <span className={s.mono} style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.path}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </aside>

        {/* detail + try it */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div className={s.row} style={{ gap: 12 }}>
              <MethodBadge method={endpoint.method} />
              <h2 className={`${s.h2} ${s.mono}`} style={{ fontSize: 17 }}>{endpoint.path}</h2>
            </div>
            <h3 className={s.h3} style={{ marginTop: 12, fontSize: 16 }}>{endpoint.summary}</h3>
            <p className={s.faint} style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.6, maxWidth: 640 }}>
              {endpoint.description}
            </p>
            <div className={s.row} style={{ marginTop: 12 }}>
              <Badge tone="gray">{endpoint.returns}</Badge>
              <Badge tone="blue">auth: bearer</Badge>
            </div>
          </div>

          {/* params table */}
          {endpoint.params.length ? (
            <div className={s.card} style={{ overflow: 'hidden' }}>
              <div className={s.panelHead}>
                <span className={s.h3}>Parameters</span>
              </div>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>In</th>
                    <th>Type</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoint.params.map((p) => (
                    <tr key={p.name}>
                      <td className={`${s.mono} ${s.strong}`} style={{ fontSize: 12.5 }}>
                        {p.name} {p.required ? <span style={{ color: 'var(--red)' }}>*</span> : null}
                      </td>
                      <td><Badge tone="gray">{p.in}</Badge></td>
                      <td className={s.mono} style={{ fontSize: 12 }}>{p.type}</td>
                      <td style={{ fontSize: 12.5 }}>{p.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <TryIt key={endpoint.id} endpoint={endpoint} apiKey={apiKey} />
        </div>
      </div>
    </div>
  );
}
