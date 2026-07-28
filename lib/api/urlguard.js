/**
 * SSRF guard for outbound webhook delivery.
 *
 * Webhook endpoints are attacker-controlled URLs the server will POST to.
 * Without filtering, an attacker can point a webhook at cloud metadata
 * (169.254.169.254), loopback, or RFC1918 hosts and use the server as a
 * proxy/scanner. This module rejects those targets.
 *
 * Defense in depth: validate at registration AND again at dispatch, and
 * dispatch with `redirect: 'error'` so a 3xx cannot bounce us to a blocked
 * address after the initial check passed.
 */

/** IPv4 ranges that must never receive a server-initiated request. */
function isPrivateIPv4(parts) {
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this" network
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  return false;
}

/** True when an IPv6 address is loopback, unique-local, link-local or unspecified. */
function isPrivateIPv6(host) {
  const h = host.toLowerCase();
  if (h === '::1' || h === '::') return true; // loopback / unspecified
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // fc00::/7 ULA
  if (h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) {
    return true; // fe80::/10 link-local
  }
  // IPv4-mapped IPv6 (::ffff:127.0.0.1) — defer to the IPv4 check on the tail.
  const mapped = h.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    const parts = mapped[1].split('.').map(Number);
    return isPrivateIPv4(parts);
  }
  return false;
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'metadata', 'instance-data']);

/**
 * Validate a webhook URL. Returns { ok:true, url } or { ok:false, reason }.
 * Pure / synchronous — checks the literal host. DNS-rebinding is mitigated by
 * the redirect:'error' dispatch policy and by re-validation on every dispatch.
 */
export function checkUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'url is not a valid URL.' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, reason: 'url must use http or https.' };
  }

  let host = u.hostname;
  // Strip IPv6 brackets ([::1] -> ::1).
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);

  const lower = host.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower) || lower.endsWith('.localhost') || lower.endsWith('.local')) {
    return { ok: false, reason: 'url must not target a local or internal host.' };
  }

  // IP-literal hosts.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateIPv4(host.split('.').map(Number))) {
      return { ok: false, reason: 'url must not target a private, loopback or link-local address.' };
    }
  } else if (host.includes(':')) {
    if (isPrivateIPv6(host)) {
      return { ok: false, reason: 'url must not target a private, loopback or link-local address.' };
    }
  }

  return { ok: true, url: u.toString() };
}

/**
 * Throw a tagged invalid_request error when the URL is unsafe. Used by routes.
 */
export function assertSafeUrl(raw) {
  const res = checkUrl(raw);
  if (!res.ok) {
    const e = new Error(res.reason);
    e.code = 'invalid_request';
    throw e;
  }
  return res.url;
}
