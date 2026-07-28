// Client-side helper for talking to the Thesauros sandbox API (/api/v1).
// The portal runs against the same origin, so base is relative.

export const BASE = '/api/v1';

export const BOOTSTRAP_KEY = 'tsk_test_thesauros_sandbox_0000000000000000';

export class PortalApiError extends Error {
  constructor(status, code, message) {
    super(message || code || `HTTP ${status}`);
    this.status = status;
    this.code = code;
  }
}

/**
 * Perform a request against the sandbox API.
 * Returns the unwrapped `data` payload; attaches `meta` + headers info
 * on the returned object's non-enumerable props for the few callers that
 * need envelopes. Most callers just want `data`.
 */
export async function api(path, { method = 'GET', key = BOOTSTRAP_KEY, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }

  if (!res.ok) {
    const err = json && json.error ? json.error : {};
    throw new PortalApiError(res.status, err.code, err.message);
  }

  const data = json && Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
  const meta = json && json.meta ? json.meta : undefined;
  return { data, meta, status: res.status, headers: res.headers };
}

export const get = (path, opts) => api(path, { ...opts, method: 'GET' });
export const post = (path, body, opts) => api(path, { ...opts, method: 'POST', body });
export const del = (path, opts) => api(path, { ...opts, method: 'DELETE' });

/* ---------- formatting ---------- */

export function fmtUsd(n, { compact = false, digits = 2 } = {}) {
  if (!Number.isFinite(n)) return '—';
  if (compact) {
    const abs = Math.abs(n);
    const suf = abs >= 1e9 ? ['B', 1e9] : abs >= 1e6 ? ['M', 1e6] : abs >= 1e3 ? ['K', 1e3] : ['', 1];
    const v = n / suf[1];
    return `$${v.toFixed(v >= 100 || suf[0] === '' ? 0 : 1)}${suf[0]}`;
  }
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtNum(n) {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US');
}

export function fmtPct(n, digits = 2) {
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}%`;
}

// The API represents APY as a decimal fraction (0.052 === 5.2%).
export function fmtApy(dec, digits = 2) {
  if (!Number.isFinite(dec)) return '—';
  return `${(dec * 100).toFixed(digits)}%`;
}

export function fmtMs(n) {
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n)}ms`;
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function timeAgo(iso) {
  if (!iso) return '—';
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function maskKey(secret) {
  if (!secret) return '—';
  // Match the API's masking format exactly (tsk_test_...a1b2).
  const prefix = secret.startsWith('tsk_live_') ? 'tsk_live_' : 'tsk_test_';
  return `${prefix}...${secret.slice(-4)}`;
}

export function shortAddr(addr) {
  if (!addr || addr.length < 12) return addr || '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function shortHash(h) {
  if (!h || h.length < 14) return h || '—';
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}
