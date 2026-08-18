/**
 * SSRF guard for outbound webhook delivery — server-side port of the sandbox's
 * lib/api/urlguard.js, field-for-field, per the portal requirements ("SSRF
 * validation of target URLs must move server-side too").
 *
 * Webhook endpoints are attacker-controlled URLs this server will POST to.
 * Without filtering, a partner can point a webhook at cloud metadata
 * (169.254.169.254), loopback, or RFC1918 hosts and use the API as a
 * proxy/scanner.
 *
 * Defense in depth: validated at registration AND again at dispatch, and
 * dispatch uses `redirect: 'error'` so a 3xx cannot bounce the request to a
 * blocked address after the initial check passed.
 */

function isPrivateIPv4(parts: number[]): boolean {
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

function isPrivateIPv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === '::1' || h === '::') return true; // loopback / unspecified
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // fc00::/7 ULA
  if (h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) {
    return true; // fe80::/10 link-local
  }
  const mapped = h.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    return isPrivateIPv4(mapped[1].split('.').map(Number));
  }
  return false;
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'metadata', 'instance-data']);

export type UrlCheckResult = { ok: true; url: string } | { ok: false; reason: string };

export function checkUrl(raw: string): UrlCheckResult {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'url is not a valid URL.' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, reason: 'url must use http or https.' };
  }

  let host = u.hostname;
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);

  const lower = host.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower) || lower.endsWith('.localhost') || lower.endsWith('.local')) {
    return { ok: false, reason: 'url must not target a local or internal host.' };
  }

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
