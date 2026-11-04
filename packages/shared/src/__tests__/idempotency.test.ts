import { generateIdempotencyKey } from '../types';

describe('generateIdempotencyKey', () => {
  it('generates a key with prefix when specified', () => {
    const key = generateIdempotencyKey('transfer');
    expect(key).toMatch(/^transfer_[a-z0-9_-]+$/i);
  });

  it('generates unique keys on successive invocations', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      keys.add(generateIdempotencyKey('deposit'));
    }
    expect(keys.size).toBe(100);
  });

  it('works with default prefix when none provided', () => {
    const key = generateIdempotencyKey();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(10);
  });
});
