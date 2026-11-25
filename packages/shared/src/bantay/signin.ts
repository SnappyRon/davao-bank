/**
 * Davao Bank — hashed sign-in signal helpers (Stage 8E).
 *
 * Pure and Deno-loadable: no imports by design. The raw email is normalised in
 * memory, keyed-hashed, and discarded. Only the 64-hex digest is persisted or
 * sent to the database, and every caller gets the same response whether or not
 * the account exists.
 */

export const SIGNIN_WINDOW_MINUTES = 15;
export const SIGNIN_FAILURE_THRESHOLD = 5;

/** Deliberately identical for known, unknown and rate-limited callers. */
export const SIGNIN_SIGNAL_RESPONSE = { status: 'accepted' } as const;

export type SigninDigest = (value: string, key: string) => Promise<string>;

export interface SigninHashes {
  emailHash: string;
  ipHash: string;
}

export interface SigninFailureFacts {
  email_hash: string;
  attempt_count: number;
  window_minutes: number;
}

/** Trim/case-fold only; plus-addresses and Unicode are preserved. */
export function normalizeSigninIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || /\s/.test(normalized)) return null;
  return normalized;
}

/** HMAC-SHA-256 via Web Crypto. `key` comes from Deno.env and is never logged. */
export async function hmacSha256(value: string, key: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto unavailable');
  const encoder = new TextEncoder();
  const cryptoKey = await subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await subtle.sign('HMAC', cryptoKey, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Domain-separated so an email digest can never be reused as an IP digest.
 * A null result means the request was malformed; it says nothing about accounts.
 */
export async function deriveSigninHashes(
  email: unknown,
  ipAddress: unknown,
  key: string,
  digest: SigninDigest = hmacSha256
): Promise<SigninHashes | null> {
  const emailValue = normalizeSigninIdentifier(email);
  if (!emailValue) return null;
  const ipValue =
    typeof ipAddress === 'string' && ipAddress.trim()
      ? ipAddress.trim().slice(0, 64)
      : 'unknown';

  const [emailHash, ipHash] = await Promise.all([
    digest(`email:${emailValue}`, key),
    digest(`ip:${ipValue}`, key),
  ]);
  if (!/^[0-9a-f]{64}$/.test(emailHash) || !/^[0-9a-f]{64}$/.test(ipHash)) {
    return null;
  }
  return { emailHash, ipHash };
}

/** 5 or more failures in 15 minutes for either bucket raises one event. */
export function shouldEmitSigninEvent(
  emailAttempts: number,
  ipAttempts: number
): boolean {
  return (
    emailAttempts >= SIGNIN_FAILURE_THRESHOLD || ipAttempts >= SIGNIN_FAILURE_THRESHOLD
  );
}

/** Facts are masked: no name, email, IP or account number is included. */
export function buildSigninFailureFacts(
  emailHash: string,
  attemptCount: number
): SigninFailureFacts {
  return {
    email_hash: emailHash,
    attempt_count: attemptCount,
    window_minutes: SIGNIN_WINDOW_MINUTES,
  };
}
