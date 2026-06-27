// ======================================================
// TAX INFO ENCRYPTION  —  AES-256-GCM
// Key: HMRC_ENCRYPTION_KEY env var (64-char hex = 32 bytes)
// Each call to encrypt() uses a fresh random IV so identical
// plaintexts produce different ciphertexts.
// Do NOT log the return value of decrypt() anywhere.
// ======================================================

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function getKey() {
  const hex = process.env.HMRC_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('HMRC_ENCRYPTION_KEY must be set to a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts a plaintext string.
 * @returns {string} JSON-serialised { iv, authTag, data } (all hex)
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv  = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  return JSON.stringify({
    iv:      iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
    data:    encrypted.toString('hex'),
  });
}

/**
 * Decrypts a value produced by encrypt().
 * @returns {string} plaintext
 */
export function decrypt(ciphertext) {
  const key = getKey();
  const { iv, authTag, data } = JSON.parse(ciphertext);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Returns a masked version of a NI / UTR number.
 * e.g. "AB 12 34 56 C"  →  "**** 56 C" (last 4 non-space chars visible)
 */
export function maskTaxId(plaintext) {
  if (!plaintext) return null;
  const stripped = plaintext.replace(/\s/g, '');
  const visible  = stripped.slice(-4);
  return `•••• ${visible}`;
}
