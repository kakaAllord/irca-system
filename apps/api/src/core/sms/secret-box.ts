import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Seals a secret the API must be able to read back, such as the Beem key it
 * sends to Beem on every message (D26). Passwords and session tokens are
 * hashed instead, because those only ever need checking; this cannot be.
 *
 * AES-256-GCM, with a fresh 12-byte nonce for every value, stored as
 * nonce ‖ tag ‖ ciphertext. A changed byte anywhere fails to open rather than
 * opening to something else.
 */
const NONCE = 12;
const TAG = 16;

export function seal(text: string, key: Buffer): Uint8Array<ArrayBuffer> {
  const nonce = randomBytes(NONCE);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  // A plain byte array, copied out of Node's pool, is what the database takes.
  return new Uint8Array(Buffer.concat([nonce, cipher.getAuthTag(), body]));
}

export function open(sealed: Uint8Array, key: Buffer): string {
  const bytes = Buffer.from(sealed);
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, NONCE));
  decipher.setAuthTag(bytes.subarray(NONCE, NONCE + TAG));
  return Buffer.concat([decipher.update(bytes.subarray(NONCE + TAG)), decipher.final()]).toString(
    'utf8',
  );
}
