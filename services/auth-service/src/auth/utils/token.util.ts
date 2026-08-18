import { randomBytes, randomInt, createHash, timingSafeEqual } from 'crypto';

/** Generates a high-entropy, URL-safe token to email to the user (invitation / password reset links). */
export function generateSecureToken(): string {
  return randomBytes(32).toString('hex');
}

/** Generates a cryptographically random 6-digit numeric OTP (registration email verification). */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// Crockford-style alphabet with ambiguous characters (0/O, 1/I/L) removed, so
// a human reading the code aloud or typing it in never has to guess which
// character was meant.
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generates a short, human-typeable organization join code (e.g. "ABC-7X92K"),
 * for a customer who can't scan a QR code or click a link. Not a secret on
 * its own the way an OTP or invitation token is — it identifies an
 * organization's *standing* join link, not a single-use credential — but is
 * still drawn from a large enough space (32^8) that guessing is impractical.
 */
export function generateJoinCode(): string {
  let raw = '';
  for (let i = 0; i < 8; i += 1) {
    raw += JOIN_CODE_ALPHABET[randomInt(0, JOIN_CODE_ALPHABET.length)];
  }
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
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
