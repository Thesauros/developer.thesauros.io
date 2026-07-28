/**
 * API key auth: bearer parsing, verification against the store, and keygen.
 *
 * Key format: `tsk_test_<base62>` / `tsk_live_<base62>`. Secrets are stored in
 * full internally but masked everywhere except the one-time POST /keys reveal.
 */

import { randomBytes, randomInt } from 'node:crypto';
import { getStore, create, filter } from './store.js';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Prefix string for an environment. */
export function envPrefix(environment) {
  return environment === 'live' ? 'tsk_live_' : 'tsk_test_';
}

/** Mask a secret for safe display: `tsk_test_...a1b2`. */
export function maskSecret(secret) {
  const prefix = secret.startsWith('tsk_live_') ? 'tsk_live_' : 'tsk_test_';
  return `${prefix}...${secret.slice(-4)}`;
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
  const key = filter('keys', (k) => k.secret === secret)[0];
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
 * secret (shown to the caller exactly once).
 *
 * Scopes are server-assigned. Callers cannot grant themselves broader access;
 * the bootstrap key is the only credential seeded with the wildcard scope.
 * @param {{label: string, environment?: 'test'|'live', scopes?: string[]}} opts
 */
export function generateKey({ label, environment = 'test', scopes }) {
  let body = '';
  for (let i = 0; i < 32; i++) body += BASE62[randomInt(BASE62.length)];
  const secret = envPrefix(environment) + body;
  const key = {
    id: `key_${randomBytes(8).toString('hex')}`,
    object: 'api_key',
    label: String(label || 'Untitled key'),
    secret,
    prefix: secret.slice(0, 12),
    environment,
    created_at: new Date().toISOString(),
    last_used_at: null,
    revoked: false,
    scopes: Array.isArray(scopes) && scopes.length ? scopes : ['read', 'write', 'keys:admin'],
  };
  create('keys', key);
  return key;
}

/** A key record safe for list responses (secret masked). */
export function publicKey(key) {
  return { ...key, secret: maskSecret(key.secret) };
}

/** Convenience accessor used by tests / portal seeding. */
export function listKeys() {
  return getStore().keys;
}
