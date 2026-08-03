/**
 * API key auth: bearer parsing, verification against the store, and keygen.
 *
 * Key format: `tsk_test_<base62>` / `tsk_live_<base62>`. Secrets are encrypted
 * at rest (AES-256-GCM via crypto.js) and looked up by SHA-256 hash for
 * constant-time matching. Plaintext seed keys are handled transparently by
 * the decrypt pass-through.
 *
 * Partner-scoped keys carry an optional `partner_id` that restricts the key
 * to partner:read operations and auto-scopes every request to that partner.
 */

import { randomBytes, randomInt } from 'node:crypto';
import { getStore, create, filter } from './store.js';
import { encrypt, decrypt, hashSecret } from './crypto.js';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Prefix string for an environment. */
export function envPrefix(environment) {
  return environment === 'live' ? 'tsk_live_' : 'tsk_test_';
}

/** Mask a secret for safe display: `tsk_test_...a1b2`. */
export function maskSecret(secretOrEncrypted) {
  const plain = decrypt(secretOrEncrypted);
  const prefix = plain.startsWith('tsk_live_') ? 'tsk_live_' : 'tsk_test_';
  return `${prefix}...${plain.slice(-4)}`;
}

/**
 * Verify the Authorization header on a request.
 * @returns {{key: object}|{error: string}}
 */
export function authenticate(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { error: 'Missing Authorization header. Use "Authorization: Bearer <key>".' };
  }
  const secret = match[1].trim();
  if (!secret.startsWith('tsk_test_') && !secret.startsWith('tsk_live_')) {
    return { error: 'Malformed API key. Keys start with tsk_test_ or tsk_live_.' };
  }
  const hash = hashSecret(secret);
  let key = filter('keys', (k) => k.secret_hash === hash)[0];
  if (!key) {
    key = filter('keys', (k) => decrypt(k.secret) === secret)[0];
  }
  if (!key) {
    return { error: 'Invalid API key.' };
  }
  if (key.revoked) {
    return { error: 'This API key has been revoked.' };
  }
  key.last_used_at = new Date().toISOString();
  return { key };
}

/**
 * Generate + persist a new API key. The returned record carries the full
 * plaintext secret (shown to the caller exactly once). The stored copy has
 * the secret encrypted and a hash for lookup.
 *
 * @param {{label: string, environment?: 'test'|'live', scopes?: string[], partner_id?: string}} opts
 */
export function generateKey({ label, environment = 'test', scopes, partner_id }) {
  let body = '';
  for (let i = 0; i < 32; i++) body += BASE62[randomInt(BASE62.length)];
  const plainSecret = envPrefix(environment) + body;
  const defaultScopes = partner_id
    ? ['read', 'partner:read']
    : ['read', 'write', 'keys:admin'];
  const key = {
    id: `key_${randomBytes(8).toString('hex')}`,
    object: 'api_key',
    label: String(label || 'Untitled key'),
    secret: encrypt(plainSecret),
    secret_hash: hashSecret(plainSecret),
    prefix: plainSecret.slice(0, 12),
    environment,
    created_at: new Date().toISOString(),
    last_used_at: null,
    revoked: false,
    scopes: Array.isArray(scopes) && scopes.length ? scopes : defaultScopes,
    partner_id: partner_id || null,
  };
  create('keys', key);
  return { ...key, secret: plainSecret };
}

/** A key record safe for list responses (secret masked). */
export function publicKey(key) {
  return { ...key, secret: maskSecret(key.secret) };
}

/** Convenience accessor used by tests / portal seeding. */
export function listKeys() {
  return getStore().keys;
}
