import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSupabaseClient } from '@davao-bank/shared';

/**
 * Davao Bank Mobile Supabase Client with persistent session support.
 *
 * Auth Storage:
 * Uses @react-native-async-storage/async-storage for session persistence.
 * (Note: In production hardening, expo-secure-store can be swapped in).
 *
 * Security:
 * Only the public anon key is exposed here. All database requests are
 * governed by Row-Level Security (RLS) policies.
 */
export const supabase = createSupabaseClient({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  storage: AsyncStorage,
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: false,
});
