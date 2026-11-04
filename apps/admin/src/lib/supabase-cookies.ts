import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface CookieItem {
  name: string;
  value: string;
  options?: {
    path?: string;
    domain?: string;
    maxAge?: number;
    expires?: Date;
    sameSite?: true | false | 'lax' | 'strict' | 'none';
    httpOnly?: boolean;
    secure?: boolean;
  };
}

/**
 * Authenticated Server Client for Admin Next.js Server Components & Route Handlers.
 * Reads user sessions from request cookies under Row-Level Security.
 */
export async function createAdminCookieServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieItem[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
              })
            );
          } catch {
            // Cannot set cookies from Server Components (handled by middleware)
          }
        },
      },
    }
  );
}
