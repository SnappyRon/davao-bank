import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';
import { createSupabaseClient } from '@davao-bank/shared';

/**
 * LargeSecureStore pattern for Supabase Auth on React Native / Expo.
 *
 * Background:
 * expo-secure-store enforces a strict 2,048-byte limit per keychain item.
 * Supabase auth sessions (containing JWT access and refresh tokens) can exceed this limit.
 *
 * Solution (Supabase Official Guide):
 * 1. Generates a random 256-bit AES key and persists it in expo-secure-store (keychain/keystore).
 * 2. Encrypts the session payload via AES-256-CTR.
 * 3. Stores the encrypted ciphertext string in AsyncStorage (which has no practical size limit).
 * 4. Decrypts ciphertext in memory upon app startup or session refresh.
 */
class LargeSecureStore {
  private async _getEncryptionKey(key: string): Promise<Uint8Array> {
    const keyAlias = `sq_key_${key.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    const existingHex = await SecureStore.getItemAsync(keyAlias);
    if (existingHex) {
      return aesjs.utils.hex.toBytes(existingHex);
    }
    const newKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    await SecureStore.setItemAsync(keyAlias, aesjs.utils.hex.fromBytes(newKey));
    return newKey;
  }

  private async _encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = await this._getEncryptionKey(key);
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const textBytes = aesjs.utils.utf8.toBytes(value);
    const encryptedBytes = cipher.encrypt(textBytes);
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async _decrypt(key: string, encryptedHex: string): Promise<string | null> {
    const keyAlias = `sq_key_${key.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    const encryptionKeyHex = await SecureStore.getItemAsync(keyAlias);
    if (!encryptionKeyHex) {
      return null;
    }
    const encryptionKey = aesjs.utils.hex.toBytes(encryptionKeyHex);
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = aesjs.utils.hex.toBytes(encryptedHex);
    const decryptedBytes = cipher.decrypt(encryptedBytes);
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    const stored = await AsyncStorage.getItem(key);
    if (!stored) {
      return null;
    }

    // Graceful backward compatibility: if value is unencrypted JSON, migrate it securely
    if (stored.trim().startsWith('{')) {
      await this.setItem(key, stored);
      return stored;
    }

    try {
      const decrypted = await this._decrypt(key, stored);
      return decrypted;
    } catch {
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this._encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    const keyAlias = `sq_key_${key.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    try {
      await SecureStore.deleteItemAsync(keyAlias);
    } catch {
      // Ignore cleanup error if already removed
    }
    await AsyncStorage.removeItem(key);
  }
}

export const supabase = createSupabaseClient({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  storage: new LargeSecureStore() as any,
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: false,
});
