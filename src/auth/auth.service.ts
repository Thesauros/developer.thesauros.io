import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';
import { StoreService } from '../store/store.service';
import { CryptoService } from '../crypto/crypto.service';

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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly store: StoreService,
    private readonly crypto: CryptoService,
  ) {}

  authenticate(secret: string): { key: ApiKey } | { error: string } {
    if (!secret.startsWith('tsk_test_') && !secret.startsWith('tsk_live_')) {
      return { error: 'Malformed API key. Keys start with tsk_test_ or tsk_live_.' };
    }
    const hash = this.crypto.hashSecret(secret);
    let key = this.store.filter<ApiKey>('keys', (k) => k.secret_hash === hash)[0];
    if (!key) {
      key = this.store.filter<ApiKey>('keys', (k) => this.crypto.decrypt(k.secret) === secret)[0];
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

  hasScope(key: ApiKey, scope: string): boolean {
    const scopes = key.scopes ?? [];
    return scopes.includes('*') || scopes.includes(scope);
  }

  generateKey(opts: {
    label: string;
    environment?: string;
    scopes?: string[];
    partner_id?: string;
  }): ApiKey & { _plaintext_secret: string } {
    const environment = opts.environment === 'live' ? 'live' : 'test';
    const prefix = environment === 'live' ? 'tsk_live_' : 'tsk_test_';
    let body = '';
    for (let i = 0; i < 32; i++) body += BASE62[randomInt(BASE62.length)];
    const plainSecret = prefix + body;
    const defaultScopes = opts.partner_id
      ? ['partner:read']
      : ['read', 'write', 'keys:admin'];
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
      scopes: opts.scopes?.length ? opts.scopes : defaultScopes,
      partner_id: opts.partner_id ?? null,
    };
    this.store.create('keys', key);
    return { ...key, _plaintext_secret: plainSecret };
  }

  maskSecret(secretOrEncrypted: string): string {
    const plain = this.crypto.decrypt(secretOrEncrypted);
    const pfx = plain.startsWith('tsk_live_') ? 'tsk_live_' : 'tsk_test_';
    return `${pfx}...${plain.slice(-4)}`;
  }

  publicKey(key: ApiKey): Omit<ApiKey, 'secret'> & { secret: string } {
    return { ...key, secret: this.maskSecret(key.secret) };
  }

  listKeys(): ApiKey[] {
    return this.store.all<ApiKey>('keys');
  }

  revokeKey(id: string): ApiKey | null {
    return this.store.update<ApiKey>('keys', id, { revoked: true } as Partial<ApiKey>);
  }
}
