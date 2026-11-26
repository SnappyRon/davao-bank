import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieItem[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, {
            ...options,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
          })
        );
      },
    },
  });

  const pathname = request.nextUrl.pathname;
  const isPublicRoute =
    pathname === '/login' ||
    pathname === '/unauthorized' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico';

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirect = (path: string) => {
    const next = NextResponse.redirect(new URL(path, request.url));
    for (const cookie of response.cookies.getAll()) next.cookies.set(cookie);
    return next;
  };
  if (isPublicRoute && pathname !== '/login') return response;
  if (!user) return isPublicRoute ? response : redirect('/login');
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (error || profile?.role !== 'admin')
    return pathname === '/login' ? response : redirect('/unauthorized');
  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || !assurance) return redirect('/login?error=mfa');
  const target = assurance.nextLevel === 'aal2' ? '/mfa/verify' : '/mfa/setup';
  if (assurance.currentLevel !== 'aal2') {
    return pathname === target ? response : redirect(target);
  }
  if (pathname === '/login' || pathname.startsWith('/mfa/')) return redirect('/');

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files with extensions (.svg, .png, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
