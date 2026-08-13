import { randomBytes, createHash, timingSafeEqual } from 'crypto';

/** Generates a high-entropy, URL-safe token to email to the user (verification / password reset). */
export function generateSecureToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Deterministically hashes an opaque, already-high-entropy token for storage.
 * SHA-256 (not argon2) is appropriate here: unlike passwords, these tokens
 * are random and unguessable, so we only need a fast, deterministic digest
 * to look them up / compare them, not a slow, salted KDF.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison of two hex-encoded hashes to avoid timing side-channels. */
export function safeCompareHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
