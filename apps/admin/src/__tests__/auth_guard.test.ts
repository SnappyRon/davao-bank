/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { createServerClient } from '@supabase/ssr';
import {
  setUserStatusAction,
  openAccountAction,
  resetUserMfaAction,
} from '../app/actions';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}));

jest.mock('@/lib/supabase-cookies', () => ({
  createAdminCookieServerClient: jest.fn(),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

describe('Admin MFA Authentication Guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('middleware MFA redirect', () => {
    it('redirects an aal1 session with enrolled MFA to /mfa/verify', async () => {
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'admin-123' } },
            error: null,
          }),
          mfa: {
            getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({
              data: { currentLevel: 'aal1', nextLevel: 'aal2' },
              error: null,
            }),
          },
        },
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { role: 'admin' },
                error: null,
              }),
            }),
          }),
        }),
      };

      (createServerClient as jest.Mock).mockReturnValue(mockSupabase);

      const req = new NextRequest(new URL('http://localhost:3000/'));
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/mfa/verify');
    });

    it('redirects an aal1 session without enrolled MFA to /mfa/setup', async () => {
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'admin-123' } },
            error: null,
          }),
          mfa: {
            getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({
              data: { currentLevel: 'aal1', nextLevel: 'aal1' },
              error: null,
            }),
          },
        },
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { role: 'admin' },
                error: null,
              }),
            }),
          }),
        }),
      };

      (createServerClient as jest.Mock).mockReturnValue(mockSupabase);

      const req = new NextRequest(new URL('http://localhost:3000/'));
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/mfa/setup');
    });

    it('allows aal2 admin session to proceed', async () => {
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'admin-123' } },
            error: null,
          }),
          mfa: {
            getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({
              data: { currentLevel: 'aal2', nextLevel: 'aal2' },
              error: null,
            }),
          },
        },
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { role: 'admin' },
                error: null,
              }),
            }),
          }),
        }),
      };

      (createServerClient as jest.Mock).mockReturnValue(mockSupabase);

      const req = new NextRequest(new URL('http://localhost:3000/'));
      const res = await middleware(req);

      // Status 200 (NextResponse.next())
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });
  });

  describe('server actions refusing aal1', () => {
    it('rejects setUserStatusAction when admin is at aal1', async () => {
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'admin-123' } },
            error: null,
          }),
          mfa: {
            getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({
              data: { currentLevel: 'aal1', nextLevel: 'aal2' },
              error: null,
            }),
          },
        },
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { role: 'admin' },
                error: null,
              }),
            }),
          }),
        }),
      };

      (createAdminCookieServerClient as jest.Mock).mockResolvedValue(mockSupabase);

      const result = await setUserStatusAction('user-uuid', 'active', 'Test');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/authenticator app/i);
    });

    it('rejects openAccountAction when admin is at aal1', async () => {
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'admin-123' } },
            error: null,
          }),
          mfa: {
            getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({
              data: { currentLevel: 'aal1', nextLevel: 'aal2' },
              error: null,
            }),
          },
        },
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { role: 'admin' },
                error: null,
              }),
            }),
          }),
        }),
      };

      (createAdminCookieServerClient as jest.Mock).mockResolvedValue(mockSupabase);

      const result = await openAccountAction('user-uuid', 'savings', 'PHP');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/authenticator app/i);
    });

    it('rejects resetUserMfaAction when admin is at aal1', async () => {
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'admin-123' } },
            error: null,
          }),
          mfa: {
            getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({
              data: { currentLevel: 'aal1', nextLevel: 'aal2' },
              error: null,
            }),
          },
        },
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { role: 'admin' },
                error: null,
              }),
            }),
          }),
        }),
      };

      (createAdminCookieServerClient as jest.Mock).mockResolvedValue(mockSupabase);

      const result = await resetUserMfaAction(
        'user-uuid',
        'Reset request via phone call'
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/authenticator app/i);
    });
  });
});
