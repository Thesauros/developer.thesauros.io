/**
 * HTTP envelopes, standard headers, error helpers and the shared route wrapper.
 *
 * Every response carries X-Request-Id, the X-RateLimit-* trio and permissive
 * CORS. Success bodies use the single/list envelopes; failures use the error
 * envelope defined in spec section 4.
 */

import { NextResponse } from 'next/server';
import { authenticate } from './auth.js';
import { consume, consumeAuthFailure } from './ratelimit.js';
import { getStore, createCapped } from './store.js';

const DOC_BASE = 'https://developer.thesauros.io/api/v1/openapi.json';

/** Standard error codes -> default HTTP status + message. */
export const ERRORS = {
  unauthorized: { status: 401, message: 'Missing or invalid API key.' },
  forbidden: { status: 403, message: 'This API key is not permitted to perform that action.' },
  invalid_request: { status: 400, message: 'The request was malformed or failed validation.' },
  not_found: { status: 404, message: 'The requested resource does not exist.' },
  rate_limited: { status: 429, message: 'Rate limit exceeded. Slow down and retry.' },
  internal: { status: 500, message: 'An unexpected error occurred.' },
};

/**
 * Scope required for a request. Key management needs `keys:admin`; partner
 * admin (managing partners/campaigns) needs `partner:admin`; the partner
 * self-service API needs `partner:read`; everything else splits read/write.
 * `*` satisfies any scope.
 */
export function requiredScope(method, pathname) {
  if (pathname.startsWith('/api/v1/keys')) return 'keys:admin';
  if (pathname.startsWith('/api/v1/partners')) {
    return method === 'GET' ? 'partner:admin' : 'partner:admin';
  }
  if (pathname.startsWith('/api/v1/partner/')) return 'partner:read';
  return method === 'GET' ? 'read' : 'write';
}

/** True when a key's scopes grant the requested scope. */
export function hasScope(key, scope) {
  const scopes = (key && key.scopes) || [];
  return scopes.includes('*') || scopes.includes(scope);
}

/**
 * Cursor pagination over an in-memory array. Cursor is an opaque base64 of
 * `offset:N`. Defaults to limit 100, max 500.
 * @returns {{items: any[], meta: {total:number, limit:number, next_cursor:string|null}}}
 */
export function paginate(request, items) {
  const { searchParams } = new URL(request.url);
  const rawLimit = parseInt(searchParams.get('limit') || '100', 10);
  const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 100, 500);
  let offset = 0;
  const cursor = searchParams.get('cursor');
  if (cursor) {
    try {
      const m = Buffer.from(cursor, 'base64').toString('utf8').match(/^offset:(\d+)$/);
      if (m) offset = parseInt(m[1], 10);
    } catch {
      /* malformed cursor -> start from the beginning */
    }
  }
  const slice = items.slice(offset, offset + limit);
  const nextOffset = offset + slice.length;
  const next_cursor =
    nextOffset < items.length ? Buffer.from(`offset:${nextOffset}`).toString('base64') : null;
  return { items: slice, meta: { total: items.length, limit, next_cursor } };
}

/**
 * Idempotency for mutating endpoints. When the client sends an Idempotency-Key
 * header, the first response envelope is cached (scoped to the API key) and
 * replayed verbatim on retry, so a duplicate POST never double-creates.
 *
 * @param {Request} request
 * @param {object|null} auth authenticated key (scopes the cache entry)
 * @param {object} api responder bundle (for headers)
 * @param {(firstAttempt:boolean)=>Promise<{status:number, body:object}>} compute
 */
export async function idempotent(request, auth, api, compute) {
  const headerKey = request.headers.get('idempotency-key');
  if (!headerKey) {
    const { status, body } = await compute(true);
    return api.raw(body, { status });
  }
  const store = getStore();
  if (!store.idempotency) store.idempotency = new Map();
  const cacheKey = `${auth ? auth.id : 'anon'}:${headerKey}`;
  const hit = store.idempotency.get(cacheKey);
  if (hit) {
    return api.raw(hit.body, { status: hit.status, headers: { 'Idempotent-Replay': 'true' } });
  }
  const { status, body } = await compute(true);
  store.idempotency.set(cacheKey, { status, body });
  return api.raw(body, { status });
}

/** A neutral rate-limit descriptor used for public / unauthenticated responses. */
export function defaultRate() {
  return { limit: 120, remaining: 120, reset: Math.ceil(Date.now() / 1000) + 60 };
}

function baseHeaders(requestId, rate, extra = {}) {
  return {
    'X-Request-Id': requestId,
    'X-RateLimit-Limit': String(rate.limit),
    'X-RateLimit-Remaining': String(Math.max(0, rate.remaining)),
    'X-RateLimit-Reset': String(rate.reset),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    ...extra,
  };
}

/**
 * Build a responder bound to a request id + rate-limit state. Handlers use
 * these so every response is uniformly enveloped and headed.
 */
export function makeResponder(requestId, rate) {
  /** Single-object envelope: { object, data, meta? }. */
  function json(data, { status = 200, meta, headers } = {}) {
    const body = { object: (data && data.object) || 'object', data };
    if (meta) body.meta = meta;
    return NextResponse.json(body, { status, headers: baseHeaders(requestId, rate, headers) });
  }

  /** List envelope: { object:"list", data:[...], meta:{ total } }. */
  function list(items, { status = 200, meta, headers } = {}) {
    const body = { object: 'list', data: items, meta: { total: items.length, ...meta } };
    return NextResponse.json(body, { status, headers: baseHeaders(requestId, rate, headers) });
  }

  /** Error envelope: { error:{ code, message, doc_url } }. */
  function error(code, message, { status, headers } = {}) {
    const def = ERRORS[code] || ERRORS.internal;
    const body = {
      error: {
        code,
        message: message || def.message,
        doc_url: `${DOC_BASE}#errors`,
      },
    };
    return NextResponse.json(body, {
      status: status || def.status,
      headers: baseHeaders(requestId, rate, headers),
    });
  }

  /** Escape hatch for non-enveloped bodies (e.g. openapi.json). */
  function raw(body, { status = 200, headers } = {}) {
    return NextResponse.json(body, { status, headers: baseHeaders(requestId, rate, headers) });
  }

  return { json, list, error, raw };
}

/**
 * Wrap a route handler with auth, rate limiting, CORS and a try/catch that
 * always yields a well-formed error envelope.
 *
 * @param {object} opts
 * @param {boolean} [opts.public] Skip auth + per-key rate limiting.
 * @param {(req, ctx, api) => Promise<Response>} handler
 *   `api` = { auth, rate, requestId, json, list, error, raw, body }
 */
export function apiHandler({ public: isPublic = false } = {}, handler) {
  return async function wrapped(request, ctx) {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    let rate = defaultRate();
    let auth = null;
    const responder = makeResponder(requestId, rate);
    let response;

    try {
      if (!isPublic) {
        const authed = authenticate(request);
        if (authed.error) {
          // M1: throttle failed auth per source IP so brute-force / key
          // enumeration can't hammer 401s unthrottled.
          const fr = consumeAuthFailure(clientIp(request));
          const rFail = makeResponder(requestId, {
            limit: fr.limit,
            remaining: fr.remaining,
            reset: fr.reset,
          });
          if (!fr.allowed) {
            response = rFail.error(
              'rate_limited',
              'Too many failed authentication attempts. Slow down and retry.',
              {
                status: 429,
                headers: { 'Retry-After': String(Math.max(1, fr.reset - Math.ceil(Date.now() / 1000))) },
              },
            );
          } else {
            response = rFail.error('unauthorized', authed.error, { status: 401 });
          }
        } else {
          auth = authed.key;
          // H4: enforce scopes. Key management needs keys:admin; everything
          // else splits read (GET) vs write (mutating).
          const url = new URL(request.url);
          const scope = requiredScope(request.method, url.pathname);
          if (!hasScope(auth, scope)) {
            response = responder.error(
              'forbidden',
              `This API key lacks the "${scope}" scope required for ${request.method} ${url.pathname}.`,
              { status: 403 },
            );
          } else {
            const rl = consume(auth.id, auth.environment);
            rate = { limit: rl.limit, remaining: rl.remaining, reset: rl.reset };
            const r2 = makeResponder(requestId, rate);
            if (!rl.allowed) {
              // M2: advertise when the client may retry.
              response = r2.error('rate_limited', ERRORS.rate_limited.message, {
                status: 429,
                headers: {
                  'Retry-After': String(Math.max(1, rl.reset - Math.ceil(Date.now() / 1000))),
                },
              });
            } else {
              response = await handler(request, ctx, { auth, rate, requestId, ...r2 });
            }
          }
        }
      } else {
        response = await handler(request, ctx, { auth, rate, requestId, ...responder });
      }
    } catch (err) {
      // Handlers throw tagged errors ({ code }) for expected failures such as
      // validation; anything untagged is a genuine internal error.
      const code = err && ERRORS[err.code] ? err.code : 'internal';
      response = responder.error(code, err && err.message ? err.message : undefined);
    }

    recordRequest(request, auth, response, Date.now() - started);
    return response;
  };
}

/** Best-effort client IP for auth-failure throttling. */
function clientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

/** Append a request to the in-process log that backs /usage. Best-effort. */
function recordRequest(request, auth, response, latency_ms) {
  try {
    const url = new URL(request.url);
    createCapped('requestLog', {
      t: Date.now(),
      keyId: auth ? auth.id : null,
      status: response ? response.status : 500,
      path: url.pathname,
      latency_ms,
    });
  } catch {
    /* logging must never break a response */
  }
}

/** Throw a tagged error the wrapper maps to the matching error envelope. */
export function fail(code, message) {
  const e = new Error(message || (ERRORS[code] && ERRORS[code].message));
  e.code = code;
  throw e;
}

/** CORS preflight handler — re-export from each route as `OPTIONS`. */
export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: baseHeaders(crypto.randomUUID(), defaultRate()),
  });
}

/**
 * Parse a JSON request body, throwing a tagged error the wrapper maps to a
 * 400 invalid_request envelope.
 */
export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    const e = new Error('Request body must be valid JSON.');
    e.code = 'invalid_request';
    throw e;
  }
}
