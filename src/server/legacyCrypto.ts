import { createDecipheriv, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import type { BuneDb } from './db.js';

function fromB64(value: string): Buffer {
  return Buffer.from(value, 'base64');
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32);
}

function verifierFor(password: string, salt: Buffer): string {
  const key = deriveKey(password, salt);
  return createHash('sha256').update(key).digest('base64');
}

export function verifyLegacyPassword(db: BuneDb, password: string): void {
  const saltValue = db.getMeta('vault_verifier_salt');
  const hashValue = db.getMeta('vault_verifier_hash');
  if (!saltValue || !hashValue) throw new Error('legacy_password_not_configured');
  const expected = fromB64(hashValue);
  const actual = fromB64(verifierFor(password, fromB64(saltValue)));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('legacy_password_invalid');
  }
}

export function decryptLegacyPrivateKey(input: {
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}, password: string): string {
  const key = deriveKey(password, fromB64(input.salt));
  const decipher = createDecipheriv('aes-256-gcm', key, fromB64(input.iv));
  decipher.setAuthTag(fromB64(input.authTag));
  return Buffer.concat([
    decipher.update(fromB64(input.ciphertext)),
    decipher.final()
  ]).toString('utf8');
}
