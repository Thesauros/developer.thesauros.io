/**
 * Per-key token-bucket rate limiter.
 *
 * Limits: 120 req/min (test keys), 600 req/min (live keys). Buckets refill
 * continuously. State lives on globalThis so it survives HMR in dev.
 */

const WINDOW_S = 60;

function limits(env) {
  return env === 'live' ? 600 : 120;
}

function buckets() {
  if (!globalThis.__thesaurosBuckets) globalThis.__thesaurosBuckets = new Map();
  return globalThis.__thesaurosBuckets;
}

/** Separate buckets for unauthenticated failures, keyed by source IP. */
function failureBuckets() {
  if (!globalThis.__thesaurosFailBuckets) globalThis.__thesaurosFailBuckets = new Map();
  return globalThis.__thesaurosFailBuckets;
}

/**
 * Consume one token for a key.
 * @param {string} keyId
 * @param {'test'|'live'} env
 * @returns {{allowed:boolean, limit:number, remaining:number, reset:number}}
 *   `reset` is the epoch second at which the bucket is full again.
 */
export function consume(keyId, env) {
  const limit = limits(env);
  const perSec = limit / WINDOW_S;
  const now = Date.now() / 1000;
  const map = buckets();

  let bucket = map.get(keyId);
  if (!bucket) {
    bucket = { tokens: limit, last: now };
    map.set(keyId, bucket);
  }

  // Refill proportionally to elapsed time, capped at the limit.
  const elapsed = Math.max(0, now - bucket.last);
  bucket.tokens = Math.min(limit, bucket.tokens + elapsed * perSec);
  bucket.last = now;

  let allowed = true;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
  } else {
    allowed = false;
  }

  const remaining = Math.floor(bucket.tokens);
  const reset = Math.ceil(now + ((limit - bucket.tokens) / perSec));
  return { allowed, limit, remaining, reset };
}

const AUTH_FAIL_LIMIT = 20; // failed auths per IP per minute before throttling

/**
 * Token bucket for unauthenticated/invalid-key attempts, keyed by source IP.
 * Throttles brute-force and key-enumeration attacks that never reach the
 * per-key limiter (which only engages after a successful auth).
 */
export function consumeAuthFailure(ip) {
  const perSec = AUTH_FAIL_LIMIT / WINDOW_S;
  const now = Date.now() / 1000;
  const map = failureBuckets();
  const key = `authfail:${ip || 'unknown'}`;

  let bucket = map.get(key);
  if (!bucket) {
    bucket = { tokens: AUTH_FAIL_LIMIT, last: now };
    map.set(key, bucket);
  }

  const elapsed = Math.max(0, now - bucket.last);
  bucket.tokens = Math.min(AUTH_FAIL_LIMIT, bucket.tokens + elapsed * perSec);
  bucket.last = now;

  let allowed = true;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
  } else {
    allowed = false;
  }

  const remaining = Math.floor(bucket.tokens);
  const reset = Math.ceil(now + ((AUTH_FAIL_LIMIT - bucket.tokens) / perSec));
  return { allowed, limit: AUTH_FAIL_LIMIT, remaining, reset };
}
