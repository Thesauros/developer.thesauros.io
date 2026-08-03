/**
 * AES-256-GCM encryption for secrets at rest.
 *
 * Secrets (API key values, webhook signing keys) are encrypted before being
 * stored in the in-process store. The module is backwards-compatible:
 * `decrypt` returns plaintext values as-is, so pre-existing unencrypted seed
 * data keeps working without migration.
 *
 * Key derivation: ENCRYPTION_KEY env var (hex or arbitrary string hashed to
 * 32 bytes). Falls back to a deterministic dev key in development.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = 'enc:';

let _derivedKey;

function deriveKey() {
  if (_derivedKey) return _derivedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (raw && /^[0-9a-f]{64}$/i.test(raw)) {
    _derivedKey = Buffer.from(raw, 'hex');
  } else if (raw) {
    _derivedKey = createHash('sha256').update(raw).digest();
  } else {
    _derivedKey = createHash('sha256')
      .update('thesauros-dev-encryption-key-do-not-use-in-prod')
      .digest();
  }
  return _derivedKey;
}

/**
 * Encrypt a plaintext string. Returns `enc:<base64(iv‖tag‖ciphertext)>`.
 * @param {string} plaintext
 * @returns {string}
 */
export function encrypt(plaintext) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, encrypted]);
  return ENCRYPTED_PREFIX + packed.toString('base64');
}

/**
 * Decrypt a blob produced by `encrypt`. Plaintext strings (without the
 * `enc:` prefix) pass through unchanged — this keeps seed data and
 * backwards compatibility working.
 * @param {string} blob
 * @returns {string}
 */
export function decrypt(blob) {
  if (typeof blob !== 'string' || !blob.startsWith(ENCRYPTED_PREFIX)) {
    return blob;
  }
  const packed = Buffer.from(blob.slice(ENCRYPTED_PREFIX.length), 'base64');
  const iv = packed.subarray(0, IV_LENGTH);
  const tag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data = packed.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, deriveKey(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
}

/**
 * True when the value is an encrypted blob (starts with `enc:`).
 * @param {string} value
 * @returns {boolean}
 */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * SHA-256 hash of a plaintext secret — used for fast key lookup without
 * decrypting every stored secret on each authenticate call.
 * @param {string} secret
 * @returns {string}
 */
export function hashSecret(secret) {
  return createHash('sha256').update(secret).digest('hex');
}

/** Reset the cached key (useful for tests that change ENCRYPTION_KEY). */
export function _resetKey() {
  _derivedKey = undefined;
}
