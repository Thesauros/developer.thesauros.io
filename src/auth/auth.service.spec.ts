import { DataSource } from 'typeorm';
import { StoreService } from '../store/store.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuthService } from './auth.service';
import { createTestStore, destroyTestStore } from '../test/create-test-store';

describe('AuthService', () => {
  let dataSource: DataSource;
  let store: StoreService;
  let crypto: CryptoService;
  let service: AuthService;

  beforeEach(async () => {
    ({ dataSource, store } = await createTestStore());
    crypto = new CryptoService();
    service = new AuthService(store, crypto);
  });

  afterEach(async () => {
    await destroyTestStore(dataSource);
  });

  describe('authenticate', () => {
    it('authenticates the bootstrap key', async () => {
      const result = await service.authenticate('tsk_test_thesauros_sandbox_0000000000000000');
      expect('key' in result).toBe(true);
      if ('key' in result) {
        expect(result.key.id).toBe('key_bootstrap');
      }
    });

    it('authenticates the Acme partner key', async () => {
      const result = await service.authenticate('tsk_test_acme_partner_key_00000000000000000');
      expect('key' in result).toBe(true);
      if ('key' in result) {
        expect(result.key.partner_id).toBe('ptn_seed_acme');
      }
    });

    it('rejects malformed keys', async () => {
      const result = await service.authenticate('bad_key_format');
      expect('error' in result).toBe(true);
    });

    it('rejects non-existent keys', async () => {
      const result = await service.authenticate('tsk_test_does_not_exist_00000000000');
      expect('error' in result).toBe(true);
    });
  });

  describe('generateKey', () => {
    it('creates a new encrypted key', async () => {
      const key = await service.generateKey({ label: 'Test key' });
      expect(key.id).toMatch(/^key_/);
      expect(key._plaintext_secret).toMatch(/^tsk_test_/);
      expect(key.secret).toMatch(/^enc:/);
      expect(key.secret_hash).toHaveLength(64);
    });

    it('created key is authenticatable', async () => {
      const key = await service.generateKey({ label: 'Auth test' });
      const result = await service.authenticate(key._plaintext_secret);
      expect('key' in result).toBe(true);
    });

    it('partner key gets partner:read scope by default', async () => {
      const key = await service.generateKey({ label: 'Partner key', partner_id: 'ptn_seed_acme' });
      expect(key.scopes).toContain('partner:read');
      expect(key.partner_id).toBe('ptn_seed_acme');
    });
  });

  describe('hasScope', () => {
    it('bootstrap key has read+write but not admin scopes', async () => {
      const key = await store.get<any>('keys', 'key_bootstrap');
      expect(service.hasScope(key!, 'read')).toBe(true);
      expect(service.hasScope(key!, 'write')).toBe(true);
      expect(service.hasScope(key!, 'keys:admin')).toBe(false);
      expect(service.hasScope(key!, 'partner:admin')).toBe(false);
    });

    it('specific scope must match', async () => {
      const key = await store.get<any>('keys', 'key_seed_acme');
      expect(service.hasScope(key!, 'partner:read')).toBe(true);
      expect(service.hasScope(key!, 'keys:admin')).toBe(false);
    });

    it('generated key cannot escalate to keys:admin', async () => {
      const key = await service.generateKey({ label: 'Escalation test', scopes: ['read', 'keys:admin', '*'] });
      expect(key.scopes).toContain('read');
      expect(key.scopes).not.toContain('keys:admin');
      expect(key.scopes).not.toContain('*');
    });

    it('generated key is always test environment', async () => {
      const key = await service.generateKey({ label: 'Env test', environment: 'live' });
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

    it('publicKey strips secret_hash and raw secret', async () => {
      const key = await service.generateKey({ label: 'PK test' });
      const pub = service.publicKey(key);
      expect(pub.secret).toMatch(/^tsk_test_\.\.\..{4}$/);
      expect(pub).not.toHaveProperty('secret_hash');
      expect(pub).not.toHaveProperty('_plaintext_secret');
    });
  });

  describe('revokeKey', () => {
    it('revokes an existing key', async () => {
      const result = await service.revokeKey('key_seed_acme');
      expect(result).not.toBeNull();
      expect(result!.revoked).toBe(true);
    });

    it('authenticate rejects revoked key', async () => {
      await service.revokeKey('key_seed_acme');
      const result = await service.authenticate('tsk_test_acme_partner_key_00000000000000000');
      expect('error' in result).toBe(true);
    });

    it('revokes every live key of a partner', async () => {
      const extra = await service.generateKey({ label: 'Second Acme key', partner_id: 'ptn_seed_acme' });
      const revoked = await service.revokeKeysForPartner('ptn_seed_acme');
      expect(revoked).toEqual(expect.arrayContaining(['key_seed_acme', extra.id]));
      const untouched = await store.get<any>('keys', 'key_seed_orbit');
      expect(untouched!.revoked).toBe(false);
    });
  });

  describe('disabled partners', () => {
    it('authenticate refuses a key bound to a disabled partner', async () => {
      await store.update('partners', 'ptn_seed_acme', { status: 'disabled' });
      const result = await service.authenticate('tsk_test_acme_partner_key_00000000000000000');
      expect(result).toEqual({
        error: expect.stringMatching(/disabled/i),
        reason: 'forbidden',
      });
    });

    it('authenticate still accepts keys with no partner binding', async () => {
      await store.update('partners', 'ptn_seed_acme', { status: 'disabled' });
      const result = await service.authenticate('tsk_test_thesauros_sandbox_0000000000000000');
      expect('key' in result).toBe(true);
    });

    it('generateKey refuses a disabled partner', async () => {
      await store.update('partners', 'ptn_seed_acme', { status: 'disabled' });
      await expect(
        service.generateKey({ label: 'Nope', partner_id: 'ptn_seed_acme' }),
      ).rejects.toThrow(/disabled/i);
    });

    it('generateKey refuses an unknown partner', async () => {
      await expect(
        service.generateKey({ label: 'Nope', partner_id: 'ptn_does_not_exist' }),
      ).rejects.toThrow(/does not exist/i);
    });
  });
});
