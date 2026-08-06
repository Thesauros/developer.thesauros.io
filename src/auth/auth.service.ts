import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';
import { StoreService } from '../store/store.service';
import { CryptoService } from '../crypto/crypto.service';

interface PartnerRecord {
  id: string;
  status: string;
  [key: string]: unknown;
}

export type AuthResult = { key: ApiKey } | { error: string; reason?: 'forbidden' };

interface ApiKey {
  id: string;
  object: string;
  label: string;
  secret: string;
  secret_hash: string | null;
  prefix: string;
  environment: string;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
  scopes: string[];
  partner_id: string | null;
  [key: string]: unknown;
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ASSIGNABLE_SCOPES = new Set(['read', 'write', 'partner:read', 'partner:admin']);
const PUBLIC_KEY_FIELDS = [
  'id', 'object', 'label', 'prefix', 'environment',
  'created_at', 'last_used_at', 'revoked', 'scopes', 'partner_id',
] as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly store: StoreService,
    private readonly crypto: CryptoService,
  ) {}

  async authenticate(secret: string): Promise<AuthResult> {
    if (!secret.startsWith('tsk_test_') && !secret.startsWith('tsk_live_')) {
      return { error: 'Malformed API key. Keys start with tsk_test_ or tsk_live_.' };
    }
    const hash = this.crypto.hashSecret(secret);
    const matches = await this.store.filter<ApiKey>('keys', (k) => k.secret_hash === hash);
    const key = matches[0];
    if (!key) {
      return { error: 'Invalid API key.' };
    }
    if (key.revoked) {
      return { error: 'This API key has been revoked.' };
    }
    if (key.partner_id) {
      const partner = await this.store.get<PartnerRecord>('partners', key.partner_id);
      if (!partner) {
        return {
          error: 'The partner linked to this API key no longer exists.',
          reason: 'forbidden',
        };
      }
      if (partner.status === 'disabled') {
        return {
          error: 'The partner linked to this API key is disabled.',
          reason: 'forbidden',
        };
      }
    }
    key.last_used_at = new Date().toISOString();
    await this.store.update<ApiKey>('keys', key.id, { last_used_at: key.last_used_at } as Partial<ApiKey>);
    return { key };
  }

  hasScope(key: ApiKey, scope: string): boolean {
    const scopes = key.scopes ?? [];
    return scopes.includes('*') || scopes.includes(scope);
  }

  async generateKey(opts: {
    label: string;
    environment?: string;
    scopes?: string[];
    partner_id?: string;
  }): Promise<ApiKey & { _plaintext_secret: string }> {
    const environment = 'test';
    const prefix = 'tsk_test_';
    if (opts.partner_id) {
      const partner = await this.store.get<PartnerRecord>('partners', opts.partner_id);
      if (!partner) {
        throw new BadRequestException(`Partner "${opts.partner_id}" does not exist.`);
      }
      if (partner.status === 'disabled') {
        throw new BadRequestException(
          `Partner "${opts.partner_id}" is disabled — re-enable it before issuing keys.`,
        );
      }
    }
    const sanitizedScopes = (opts.scopes ?? []).filter((s) => ASSIGNABLE_SCOPES.has(s));
    const defaultScopes = opts.partner_id
      ? ['partner:read']
      : ['read', 'write'];
    const finalScopes = sanitizedScopes.length > 0 ? sanitizedScopes : defaultScopes;
    let body = '';
    for (let i = 0; i < 32; i++) body += BASE62[randomInt(BASE62.length)];
    const plainSecret = prefix + body;
    const key: ApiKey = {
      id: `key_${randomBytes(8).toString('hex')}`,
      object: 'api_key',
      label: String(opts.label || 'Untitled key'),
      secret: this.crypto.encrypt(plainSecret),
      secret_hash: this.crypto.hashSecret(plainSecret),
      prefix: plainSecret.slice(0, 12),
      environment,
      created_at: new Date().toISOString(),
      last_used_at: null,
      revoked: false,
      scopes: finalScopes,
      partner_id: opts.partner_id ?? null,
    };
    await this.store.create('keys', key);
    return { ...key, _plaintext_secret: plainSecret };
  }

  maskSecret(secretOrEncrypted: string): string {
    const plain = this.crypto.decrypt(secretOrEncrypted);
    const pfx = plain.startsWith('tsk_live_') ? 'tsk_live_' : 'tsk_test_';
    return `${pfx}...${plain.slice(-4)}`;
  }

  /**
   * Whitelists the fields safe to return to clients — never the stored secret,
   * its hash, or the one-time plaintext. Pass `plaintextSecret` on creation, the
   * only moment the full secret is shown.
   */
  publicKey(key: ApiKey, plaintextSecret?: string): Record<string, unknown> & { secret: string } {
    const safe: Record<string, unknown> = {};
    for (const field of PUBLIC_KEY_FIELDS) {
      safe[field] = key[field];
    }
    safe['secret'] = plaintextSecret ?? this.maskSecret(key.secret);
    return safe as Record<string, unknown> & { secret: string };
  }

  async listKeys(): Promise<ApiKey[]> {
    return this.store.all<ApiKey>('keys');
  }

  async revokeKey(id: string): Promise<ApiKey | null> {
    return this.store.update<ApiKey>('keys', id, { revoked: true } as Partial<ApiKey>);
  }

  /** Revokes every live key bound to a partner. Used when a partner is disabled. */
  async revokeKeysForPartner(partnerId: string): Promise<string[]> {
    const live = await this.store.filter<ApiKey>(
      'keys',
      (k) => k.partner_id === partnerId && !k.revoked,
    );
    for (const key of live) {
      await this.store.update<ApiKey>('keys', key.id, { revoked: true } as Partial<ApiKey>);
    }
    if (live.length > 0) {
      this.logger.log(`Revoked ${live.length} key(s) for disabled partner ${partnerId}`);
    }
    return live.map((k) => k.id);
  }
}
