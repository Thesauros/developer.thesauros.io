import { Injectable } from '@nestjs/common';
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

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    const raw = process.env.ENCRYPTION_KEY;
    if (raw && /^[0-9a-f]{64}$/i.test(raw)) {
      this.key = Buffer.from(raw, 'hex');
    } else if (raw) {
      this.key = createHash('sha256').update(raw).digest();
    } else {
      this.key = createHash('sha256')
        .update('thesauros-dev-encryption-key-do-not-use-in-prod')
        .digest();
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const packed = Buffer.concat([iv, tag, encrypted]);
    return ENCRYPTED_PREFIX + packed.toString('base64');
  }

  decrypt(blob: string): string {
    if (!blob.startsWith(ENCRYPTED_PREFIX)) return blob;
    const packed = Buffer.from(blob.slice(ENCRYPTED_PREFIX.length), 'base64');
    const iv = packed.subarray(0, IV_LENGTH);
    const tag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const data = packed.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
  }

  hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  isEncrypted(value: string): boolean {
    return value.startsWith(ENCRYPTED_PREFIX);
  }
}
