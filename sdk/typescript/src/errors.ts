/**
 * Typed error hierarchy for the Thesauros SDK.
 *
 * Every error thrown by the SDK extends {@link ThesaurosError}, so callers can
 * catch the whole family with a single `catch (err) { if (err instanceof
 * ThesaurosError) ... }` and then narrow on the specific subclass.
 */

/**
 * Base class for all SDK errors. Also used directly for client-side validation
 * failures (e.g. a missing `apiKey`).
 */
export class ThesaurosError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ThesaurosError';
    // Restore the prototype chain so `instanceof` works when transpiling to
    // older targets that don't natively support extending built-ins.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * A non-2xx response carrying the API's error envelope. Exposes the HTTP
 * `status`, the machine-readable `code`, the human `message`, an optional
 * `doc_url`, and the `X-Request-Id` of the failing request (useful when
 * contacting support).
 */
export class ApiError extends ThesaurosError {
  readonly status: number;
  readonly code: string;
  readonly doc_url: string | undefined;
  readonly requestId: string | undefined;

  constructor(opts: {
    status: number;
    code: string;
    message: string;
    doc_url?: string;
    requestId?: string;
  }) {
    super(opts.message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.doc_url = opts.doc_url;
    this.requestId = opts.requestId;
  }
}

/**
 * A `429 Too Many Requests` response. `retryAfter` (seconds) is populated from
 * the `Retry-After` header or derived from `X-RateLimit-Reset` when available.
 * The SDK retries these automatically up to `maxRetries`; this error is only
 * surfaced once retries are exhausted.
 */
export class RateLimitError extends ApiError {
  readonly retryAfter: number | undefined;

  constructor(opts: {
    status: number;
    code: string;
    message: string;
    doc_url?: string;
    requestId?: string;
    retryAfter?: number;
  }) {
    super(opts);
    this.name = 'RateLimitError';
    this.retryAfter = opts.retryAfter;
  }
}

/**
 * A transport-level failure: DNS resolution, connection refused, TLS error, or
 * a request timeout. The underlying cause (if any) is available on `cause`.
 */
export class NetworkError extends ThesaurosError {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'NetworkError';
  }
}
