import {
  buildSigninFailureFacts,
  deriveSigninHashes,
  hmacSha256,
  normalizeSigninIdentifier,
  shouldEmitSigninEvent,
  SIGNIN_SIGNAL_RESPONSE,
  type SigninDigest,
} from '../bantay/signin';

const hex64 = /^[0-9a-f]{64}$/;

/** Deterministic stand-in so no test needs a real secret. */
const digest: SigninDigest = async (value, key) =>
  Array.from({ length: 64 }, (_, i) =>
    (
      (value.charCodeAt(i % value.length) + key.charCodeAt(i % key.length) + i) %
      16
    ).toString(16)
  ).join('');

describe('Bantay sign-in signal helpers', () => {
  it('normalises only the email used for hashing', () => {
    expect(normalizeSigninIdentifier('  Customer1@DavaoBank.PH ')).toBe(
      'customer1@davaobank.ph'
    );
    expect(normalizeSigninIdentifier('customer one@davaobank.ph')).toBeNull();
    expect(normalizeSigninIdentifier('')).toBeNull();
    expect(normalizeSigninIdentifier(123)).toBeNull();
  });

  it('never exposes the raw email or IP in derived hashes', async () => {
    const hashes = await deriveSigninHashes(
      ' Customer1@DavaoBank.PH ',
      '203.0.113.7',
      'test-only-key',
      digest
    );
    expect(hashes).not.toBeNull();
    expect(hashes?.emailHash).toMatch(hex64);
    expect(hashes?.ipHash).toMatch(hex64);
    const output = JSON.stringify(hashes);
    expect(output).not.toContain('Customer1@DavaoBank.PH');
    expect(output).not.toContain('customer1@davaobank.ph');
    expect(output).not.toContain('203.0.113.7');
  });

  it('is case-insensitive for the email and domain-separated from the IP', async () => {
    const first = await deriveSigninHashes(
      'customer1@davaobank.ph',
      '203.0.113.7',
      'k',
      digest
    );
    const same = await deriveSigninHashes(
      'CUSTOMER1@DAVAOBANK.PH',
      '203.0.113.7',
      'k',
      digest
    );
    const otherIp = await deriveSigninHashes(
      'customer1@davaobank.ph',
      '203.0.113.8',
      'k',
      digest
    );
    expect(same?.emailHash).toBe(first?.emailHash);
    expect(first?.emailHash).not.toBe(first?.ipHash);
    expect(otherIp?.ipHash).not.toBe(first?.ipHash);
  });

  it('rejects malformed requests and invalid digests without an account oracle', async () => {
    expect(await deriveSigninHashes(null, '203.0.113.7', 'k', digest)).toBeNull();
    expect(
      await deriveSigninHashes(
        'customer1@davaobank.ph',
        '203.0.113.7',
        'k',
        async () => 'bad'
      )
    ).toBeNull();
    expect(SIGNIN_SIGNAL_RESPONSE).toEqual({ status: 'accepted' });
  });

  it('uses 5 failures in 15 minutes for either bucket', () => {
    expect(shouldEmitSigninEvent(4, 4)).toBe(false);
    expect(shouldEmitSigninEvent(5, 0)).toBe(true);
    expect(shouldEmitSigninEvent(0, 5)).toBe(true);
  });

  it('stores only the hash, count and window in event facts', () => {
    const emailHash = 'a'.repeat(64);
    expect(buildSigninFailureFacts(emailHash, 5)).toEqual({
      email_hash: emailHash,
      attempt_count: 5,
      window_minutes: 15,
    });
  });

  it('produces a Web Crypto HMAC when no digest is injected', async () => {
    expect(await hmacSha256('email:customer1@davaobank.ph', 'test-only-key')).toMatch(
      hex64
    );
  });
});
