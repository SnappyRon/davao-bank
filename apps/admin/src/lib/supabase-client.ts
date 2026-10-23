import { createSupabaseClient } from '@davao-bank/shared';

/**
 * Public client-side Supabase instance for Admin Portal.
 * Uses only NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * Bound by Row Level Security (RLS).
 */
export const supabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
