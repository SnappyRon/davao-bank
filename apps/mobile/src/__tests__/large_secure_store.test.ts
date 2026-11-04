import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { LargeSecureStore } from '../lib/supabase';

// Mock AsyncStorage and SecureStore
const secureStoreMock: Record<string, string> = {};
const asyncStorageMock: Record<string, string> = {};

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => secureStoreMock[key] ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    secureStoreMock[key] = value;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete secureStoreMock[key];
  }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => asyncStorageMock[key] ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    asyncStorageMock[key] = value;
  }),
  removeItem: jest.fn(async (key: string) => {
    delete asyncStorageMock[key];
  }),
}));

describe('LargeSecureStore (F6 Key Rotation and Roundtrip)', () => {
  let store: LargeSecureStore;

  beforeEach(() => {
    store = new LargeSecureStore();
    for (const k of Object.keys(secureStoreMock)) delete secureStoreMock[k];
    for (const k of Object.keys(asyncStorageMock)) delete asyncStorageMock[k];
    jest.clearAllMocks();
  });

  it('generates a fresh random key and unique ciphertext on every setItem call', async () => {
    const key = 'sb-test-auth-token';
    const payload = JSON.stringify({
      access_token: 'jwt-12345',
      refresh_token: 'refresh-67890',
    });

    // First setItem
    await store.setItem(key, payload);
    const key1 = secureStoreMock['sq_key_sb_test_auth_token'];
    const ciphertext1 = asyncStorageMock[key];

    expect(key1).toBeDefined();
    expect(ciphertext1).toBeDefined();
    expect(ciphertext1).not.toBe(payload);

    // Verify round-trip for first set
    const retrieved1 = await store.getItem(key);
    expect(retrieved1).toBe(payload);

    // Second setItem with exact same payload
    await store.setItem(key, payload);
    const key2 = secureStoreMock['sq_key_sb_test_auth_token'];
    const ciphertext2 = asyncStorageMock[key];

    // Assert that the AES key was rotated
    expect(key2).not.toBe(key1);
    // Assert that the ciphertext is different even for the exact same payload
    expect(ciphertext2).not.toBe(ciphertext1);

    // Verify round-trip after rotation
    const retrieved2 = await store.getItem(key);
    expect(retrieved2).toBe(payload);
  });

  it('migrates unencrypted legacy JSON payload seamlessly', async () => {
    const key = 'sb-legacy-token';
    const rawJson = JSON.stringify({
      access_token: 'legacy-token',
      user: { id: 'user-1' },
    });

    // Seed unencrypted JSON in AsyncStorage
    asyncStorageMock[key] = rawJson;

    const retrieved = await store.getItem(key);
    expect(retrieved).toBe(rawJson);

    // Should now be migrated into ciphertext + secure store key
    expect(asyncStorageMock[key]).not.toBe(rawJson);
    expect(secureStoreMock['sq_key_sb_legacy_token']).toBeDefined();

    // Subsequent retrieval should still succeed
    const retrievedAfterMigration = await store.getItem(key);
    expect(retrievedAfterMigration).toBe(rawJson);
  });

  it('removes both secure key and async storage ciphertext on removeItem', async () => {
    const key = 'sb-to-delete';
    await store.setItem(key, 'some-value');

    expect(secureStoreMock['sq_key_sb_to_delete']).toBeDefined();
    expect(asyncStorageMock[key]).toBeDefined();

    await store.removeItem(key);

    expect(secureStoreMock['sq_key_sb_to_delete']).toBeUndefined();
    expect(asyncStorageMock[key]).toBeUndefined();

    const retrieved = await store.getItem(key);
    expect(retrieved).toBeNull();
  });
});
