/**
 * Transport layer for the Thesauros SDK.
 *
 * Responsibilities:
 *  - attach auth + JSON headers and a stable `User-Agent`
 *  - build URLs and query strings against a configurable base URL
 *  - unwrap the API envelope (return `.data`, surface `.meta` via `lastResponse`)
 *  - retry `429` / `5xx` with exponential backoff + jitter, honoring
 *    `Retry-After` and `X-RateLimit-Reset`
 *  - enforce a per-request timeout via `AbortController`
 *  - throw typed errors ({@link ApiError}, {@link RateLimitError}, {@link NetworkError})
 *
 * Uses the runtime-global `fetch` (Node >= 18, Deno, Bun, Cloudflare Workers,
 * and all modern browsers). No HTTP dependency is bundled.
 */

import { ApiError, NetworkError, RateLimitError, ThesaurosError } from './errors.js';

/** Default API base URL (the deployed sandbox host). Override via `base_url`. */
export const DEFAULT_BASE_URL = 'https://developer.thesauros.io/api/v1';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const MAX_BACKOFF_MS = 10_000;
const MAX_DELAY_MS = 30_000;
const USER_AGENT = 'thesauros-sdk-ts/1.0.0';

/** Configuration accepted by the {@link Thesauros} client constructor. */
export interface ClientConfig {
  /** API secret key, e.g. `tsk_test_...` (sandbox) or `tsk_live_...`. Required. */
  apiKey: string;
  /** API base URL. Defaults to {@link DEFAULT_BASE_URL}. */
  base_url?: string;
  /** Per-request timeout in milliseconds. Defaults to `30000`. */
  timeout?: number;
  /** Maximum number of retries for `429`/`5xx` responses. Defaults to `3`. */
  maxRetries?: number;
}

/** Parsed `X-RateLimit-*` response headers. */
export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  /** Unix epoch seconds at which the rate-limit window resets. */
  reset?: number;
}

/**
 * Metadata from the most recent completed request. Exposed on the client as
 * `client.lastResponse` so that the unwrapped `.data` can be returned directly
 * from resource methods while envelope `meta`, the request id, and rate-limit
 * state remain accessible.
 */
export interface LastResponse {
  status: number;
  object?: string;
  meta?: Record<string, unknown>;
  requestId?: string;
  rateLimit: RateLimitInfo;
}

/** Internal description of a single API call. */
export interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Path relative to the base URL, e.g. `vaults` or `positions/pos_1/withdraw`. */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

/** Loosely-typed view of a parsed envelope used only inside the transport. */
interface ParsedEnvelope {
  object?: string;
  data?: unknown;
  meta?: Record<string, unknown>;
  error?: { code?: string; message?: string; doc_url?: string };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function parseRateLimit(headers: Headers): RateLimitInfo {
  const num = (name: string): number | undefined => {
    const raw = headers.get(name);
    if (raw === null) return undefined;
    const n = Number(raw);
    return Number.isNaN(n) ? undefined : n;
  };
  return {
    limit: num('x-ratelimit-limit'),
    remaining: num('x-ratelimit-remaining'),
    reset: num('x-ratelimit-reset'),
  };
}

/**
 * Resolve how long to wait before retrying, in seconds. Prefers the
 * `Retry-After` header (integer seconds or HTTP-date); falls back to
 * `X-RateLimit-Reset` (unix epoch seconds). Returns `undefined` when neither is
 * present or parseable.
 */
function parseRetryAfter(headers: Headers, resetEpoch?: number): number | undefined {
  const ra = headers.get('retry-after');
  if (ra !== null) {
    const secs = Number(ra);
    if (!Number.isNaN(secs)) return secs;
    const dateMs = Date.parse(ra);
    if (!Number.isNaN(dateMs)) return Math.max(0, (dateMs - Date.now()) / 1000);
  }
  if (resetEpoch !== undefined) {
    return Math.max(0, resetEpoch - Date.now() / 1000);
  }
  return undefined;
}

export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;

  /** Metadata from the most recent completed request, or `null` before any call. */
  lastResponse: LastResponse | null = null;

  constructor(config: ClientConfig) {
    if (!config.apiKey) {
      throw new ThesaurosError('apiKey is required to construct a Thesauros client.');
    }
    this.apiKey = config.apiKey;
    const base = config.base_url ?? DEFAULT_BASE_URL;
    // Guarantee exactly one trailing slash so relative URL resolution is stable.
    this.baseUrl = base.replace(/\/+$/, '') + '/';
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  /**
   * Execute a request, unwrap the envelope, and return `data` typed as `T`.
   * Envelope `meta`, the request id, and rate-limit headers are recorded on
   * {@link HttpClient.lastResponse}.
   */
  async request<T>(opts: RequestOptions): Promise<T> {
    const url = this.buildUrl(opts.path, opts.query);
    const hasBody = opts.body !== undefined;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    };
    if (hasBody) headers['Content-Type'] = 'application/json';
    const payload = hasBody ? JSON.stringify(opts.body) : undefined;

    let attempt = 0;
    // Loop performs at most `maxRetries + 1` total attempts.
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      let response: Response;
      try {
        response = await fetch(url, {
          method: opts.method,
          headers,
          body: payload,
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) {
          throw new NetworkError(`Request timed out after ${this.timeout}ms.`);
        }
        throw new NetworkError(`Network request failed: ${errorMessage(err)}`, err);
      } finally {
        clearTimeout(timer);
      }

      const requestId = response.headers.get('x-request-id') ?? undefined;
      const rateLimit = parseRateLimit(response.headers);
      const text = await response.text();

      if (response.ok) {
        let envelope: ParsedEnvelope;
        try {
          envelope = text ? (JSON.parse(text) as ParsedEnvelope) : {};
        } catch (err) {
          throw new ThesaurosError('Malformed JSON in successful response.', { cause: err });
        }
        this.lastResponse = {
          status: response.status,
          object: envelope.object,
          meta: envelope.meta,
          requestId,
          rateLimit,
        };
        return envelope.data as T;
      }

      // Non-2xx: parse the error envelope (best-effort) and build a typed error.
      let parsed: ParsedEnvelope | undefined;
      try {
        parsed = text ? (JSON.parse(text) as ParsedEnvelope) : undefined;
      } catch {
        parsed = undefined;
      }
      const errBody = parsed?.error;
      const code = errBody?.code ?? `http_${response.status}`;
      const message = errBody?.message ?? response.statusText ?? 'Request failed.';
      const doc_url = errBody?.doc_url;
      const retryAfter = parseRetryAfter(response.headers, rateLimit.reset);

      const error =
        response.status === 429
          ? new RateLimitError({ status: 429, code, message, doc_url, requestId, retryAfter })
          : new ApiError({ status: response.status, code, message, doc_url, requestId });

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        await sleep(this.backoffDelay(attempt, retryAfter));
        attempt += 1;
        continue;
      }
      throw error;
    }
  }

  /** Exponential backoff with jitter, floored by any server-provided retry hint. */
  private backoffDelay(attempt: number, retryAfterSeconds?: number): number {
    const exponential = Math.min(MAX_BACKOFF_MS, BASE_DELAY_MS * 2 ** attempt);
    const jitter = Math.random() * BASE_DELAY_MS;
    let delay = exponential + jitter;
    if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
      delay = Math.max(delay, retryAfterSeconds * 1000);
    }
    return Math.min(delay, MAX_DELAY_MS);
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): string {
    const url = new URL(path.replace(/^\/+/, ''), this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}
