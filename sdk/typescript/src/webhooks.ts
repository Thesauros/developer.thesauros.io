/**
 * Webhook signature verification.
 *
 * The API signs every webhook delivery with an HMAC-SHA256 over the string
 * `"<t>.<rawBody>"`, where `<t>` is the unix timestamp from the signature
 * header. The header format is:
 *
 *     Webhook-Signature: t=<unix>,v1=<hex hmac>[,v1=<hex hmac>...]
 *
 * Verification recomputes the HMAC with your endpoint's signing secret
 * (`whsec_...`) and compares it against each `v1` component using a
 * constant-time comparison. Multiple `v1` values are supported to allow secret
 * rotation (the sender may sign with the old and new secret simultaneously).
 *
 * This implementation uses the Web Crypto API (`globalThis.crypto.subtle`),
 * which is available in Node >= 18, Deno, Bun, Cloudflare Workers, and all
 * modern browsers — so it works unchanged across server and edge runtimes and
 * requires no `node:crypto` import.
 */

const encoder = new TextEncoder();

/** Options for {@link verifyWebhookSignature}. */
export interface VerifyOptions {
  /**
   * When set, reject signatures whose timestamp `t` is more than this many
   * seconds away from `now` (replay protection). Disabled by default so that
   * verification is purely an authenticity check unless you opt in.
   */
  toleranceSeconds?: number;
  /** Current time in milliseconds since the epoch. Defaults to `Date.now()`. Inject for tests. */
  now?: number;
}

interface SignatureComponents {
  t?: string;
  v1: string[];
}

function parseSignatureHeader(header: string): SignatureComponents {
  const result: SignatureComponents = { v1: [] };
  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === 't') result.t = value;
    else if (key === 'v1') result.v1.push(value);
  }
  return result;
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Constant-time equality for fixed-format hex digests. HMAC-SHA256 output is
 * always 32 bytes (64 hex chars), so the early length return does not leak
 * secret-dependent timing information.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Build the `"<t>.<body>"` bytes to be signed. The return type is deliberately
 * inferred rather than annotated as `Uint8Array` so it stays
 * `Uint8Array<ArrayBuffer>`: Web Crypto's `BufferSource` parameter requires an
 * `ArrayBuffer`-backed view and rejects the wider `Uint8Array<ArrayBufferLike>`.
 */
function buildSignedPayload(t: string, rawBody: string | Uint8Array) {
  if (typeof rawBody === 'string') {
    return encoder.encode(`${t}.${rawBody}`);
  }
  const prefix = encoder.encode(`${t}.`);
  const out = new Uint8Array(prefix.length + rawBody.length);
  out.set(prefix, 0);
  out.set(rawBody, prefix.length);
  return out;
}

/**
 * Verify a webhook delivery signature.
 *
 * @param secret           The endpoint signing secret (`whsec_...`).
 * @param signatureHeader  The raw `Webhook-Signature` header value.
 * @param rawBody          The exact request body bytes as received (a string or
 *                         `Uint8Array`). Must be the unmodified raw body — do not
 *                         pass a re-serialized/parsed object.
 * @param options          Optional timestamp tolerance (replay protection).
 * @returns `true` if the signature is authentic, `false` otherwise.
 *
 * @example
 * import { verifyWebhookSignature } from '@thesauros/sdk';
 *
 * const ok = await verifyWebhookSignature(
 *   webhook.secret,
 *   req.headers.get('webhook-signature'),
 *   rawBody,
 *   { toleranceSeconds: 300 },
 * );
 */
export async function verifyWebhookSignature(
  secret: string,
  signatureHeader: string | null | undefined,
  rawBody: string | Uint8Array,
  options: VerifyOptions = {},
): Promise<boolean> {
  if (!signatureHeader) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (t === undefined || v1.length === 0) return false;

  if (options.toleranceSeconds !== undefined) {
    const tsSeconds = Number(t);
    if (Number.isNaN(tsSeconds)) return false;
    const now = options.now ?? Date.now();
    if (Math.abs(now - tsSeconds * 1000) > options.toleranceSeconds * 1000) return false;
  }

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'Web Crypto (globalThis.crypto.subtle) is unavailable in this runtime; ' +
        'webhook signature verification requires Node >= 18 or an equivalent environment.',
    );
  }

  const key = await subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await subtle.sign('HMAC', key, buildSignedPayload(t, rawBody));
  const expected = toHex(signature);

  return v1.some((provided) => timingSafeEqual(expected, provided.toLowerCase()));
}
