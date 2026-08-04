import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(() => {
    service = new CryptoService();
  });

  it('encrypts and decrypts to original plaintext', () => {
    const plaintext = 'tsk_test_hello_world_1234567890';
    const encrypted = service.encrypt(plaintext);
    expect(encrypted).toMatch(/^enc:/);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it('decrypt passes through plaintext strings', () => {
    const plain = 'tsk_test_plain_value';
    expect(service.decrypt(plain)).toBe(plain);
  });

  it('produces different ciphertexts for the same input (random IV)', () => {
    const plaintext = 'same_value';
    const a = service.encrypt(plaintext);
    const b = service.encrypt(plaintext);
    expect(a).not.toBe(b);
    expect(service.decrypt(a)).toBe(plaintext);
    expect(service.decrypt(b)).toBe(plaintext);
  });

  it('isEncrypted detects encrypted vs plaintext', () => {
    expect(service.isEncrypted('enc:abc')).toBe(true);
    expect(service.isEncrypted('tsk_test_plain')).toBe(false);
  });

  it('hashSecret produces consistent SHA-256 hex', () => {
    const hash1 = service.hashSecret('test');
    const hash2 = service.hashSecret('test');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(service.hashSecret('other')).not.toBe(hash1);
  });
});
