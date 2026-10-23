import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase Client Helper for Davao Bank Admin.
 *
 * CRITICAL SECURITY INVARIANT:
 * - Uses SUPABASE_SERVICE_ROLE_KEY which bypasses Row Level Security (RLS).
 * - NEVER prefix this key with NEXT_PUBLIC_ or EXPO_PUBLIC_.
 * - MUST ONLY be used in Route Handlers, Server Actions, or Server Components.
 * - The 'server-only' package import ensures a build error occurs if any client
 *   component attempts to import this file.
 */
export function createServerSupabaseClient(): SupabaseClient {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'http://127.0.0.1:54321';

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured in server environment variables. ' +
        'This key is required for server-only administrative operations.'
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
