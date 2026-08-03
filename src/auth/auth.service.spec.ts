import { StoreService } from '../store/store.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let store: StoreService;
  let crypto: CryptoService;
  let service: AuthService;

  beforeEach(() => {
    delete (globalThis as any).__thesaurosNestStore;
    store = new StoreService();
    store.onModuleInit();
    crypto = new CryptoService();
    service = new AuthService(store, crypto);
  });

  describe('authenticate', () => {
    it('authenticates the bootstrap key', () => {
      const result = service.authenticate('tsk_test_thesauros_sandbox_0000000000000000');
      expect('key' in result).toBe(true);
      if ('key' in result) {
        expect(result.key.id).toBe('key_bootstrap');
      }
    });

    it('authenticates the Acme partner key', () => {
      const result = service.authenticate('tsk_test_acme_partner_key_00000000000000000');
      expect('key' in result).toBe(true);
      if ('key' in result) {
        expect(result.key.partner_id).toBe('ptn_seed_acme');
      }
    });

    it('rejects malformed keys', () => {
      const result = service.authenticate('bad_key_format');
      expect('error' in result).toBe(true);
    });

    it('rejects non-existent keys', () => {
      const result = service.authenticate('tsk_test_does_not_exist_00000000000');
      expect('error' in result).toBe(true);
    });
  });

  describe('generateKey', () => {
    it('creates a new encrypted key', () => {
      const key = service.generateKey({ label: 'Test key' });
      expect(key.id).toMatch(/^key_/);
      expect(key._plaintext_secret).toMatch(/^tsk_test_/);
      expect(key.secret).toMatch(/^enc:/);
      expect(key.secret_hash).toHaveLength(64);
    });

    it('created key is authenticatable', () => {
      const key = service.generateKey({ label: 'Auth test' });
      const result = service.authenticate(key._plaintext_secret);
      expect('key' in result).toBe(true);
    });

    it('partner key gets partner:read scope by default', () => {
      const key = service.generateKey({ label: 'Partner key', partner_id: 'ptn_seed_acme' });
      expect(key.scopes).toContain('partner:read');
      expect(key.partner_id).toBe('ptn_seed_acme');
    });
  });

  describe('hasScope', () => {
    it('bootstrap key has read+write but not admin scopes', () => {
      const key = store.get<any>('keys', 'key_bootstrap');
      expect(service.hasScope(key!, 'read')).toBe(true);
      expect(service.hasScope(key!, 'write')).toBe(true);
      expect(service.hasScope(key!, 'keys:admin')).toBe(false);
      expect(service.hasScope(key!, 'partner:admin')).toBe(false);
    });

    it('specific scope must match', () => {
      const key = store.get<any>('keys', 'key_seed_acme');
      expect(service.hasScope(key!, 'partner:read')).toBe(true);
      expect(service.hasScope(key!, 'keys:admin')).toBe(false);
    });

    it('generated key cannot escalate to keys:admin', () => {
      const key = service.generateKey({ label: 'Escalation test', scopes: ['read', 'keys:admin', '*'] });
      expect(key.scopes).toContain('read');
      expect(key.scopes).not.toContain('keys:admin');
      expect(key.scopes).not.toContain('*');
    });

    it('generated key is always test environment', () => {
      const key = service.generateKey({ label: 'Env test', environment: 'live' });
      expect(key.environment).toBe('test');
      expect(key._plaintext_secret).toMatch(/^tsk_test_/);
    });
  });

  describe('maskSecret + publicKey', () => {
    it('masks plaintext secrets', () => {
      expect(service.maskSecret('tsk_test_abcdef1234')).toBe('tsk_test_...1234');
    });

    it('masks encrypted secrets', () => {
      const encrypted = crypto.encrypt('tsk_live_abcdef5678');
      const masked = service.maskSecret(encrypted);
      expect(masked).toBe('tsk_live_...5678');
    });

    it('publicKey strips secret_hash and raw secret', () => {
      const key = service.generateKey({ label: 'PK test' });
      const pub = service.publicKey(key);
      expect(pub.secret).toMatch(/^tsk_test_\.\.\..{4}$/);
      expect(pub).not.toHaveProperty('secret_hash');
      expect(pub).not.toHaveProperty('_plaintext_secret');
    });
  });

  describe('revokeKey', () => {
    it('revokes an existing key', () => {
      const result = service.revokeKey('key_seed_acme');
      expect(result).not.toBeNull();
      expect(result!.revoked).toBe(true);
    });

    it('authenticate rejects revoked key', () => {
      service.revokeKey('key_seed_acme');
      const result = service.authenticate('tsk_test_acme_partner_key_00000000000000000');
      expect('error' in result).toBe(true);
    });
  });
});
