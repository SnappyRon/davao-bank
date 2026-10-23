'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { colors } from '@davao-bank/shared';
import { createAdminBrowserClient } from '@/lib/supabase-browser';

export default function UnauthorizedPage() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createAdminBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: colors.background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: colors.surface,
          borderRadius: '20px',
          padding: '2.5rem',
          border: `1px solid ${colors.border}`,
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '16px',
            backgroundColor: colors.errorLight,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.75rem',
            marginBottom: '1.25rem',
          }}
        >
          🚫
        </div>

        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 800,
            color: colors.textPrimary,
            marginBottom: '0.5rem',
          }}
        >
          Staff Authorization Required
        </h1>

        <p
          style={{
            fontSize: '0.9rem',
            color: colors.textSecondary,
            lineHeight: 1.6,
            marginBottom: '1.5rem',
          }}
        >
          You are currently signed in with an account that does not have the{' '}
          <strong style={{ color: colors.primary }}>admin</strong> role. In compliance
          with Davao Bank least-privilege architecture (§6.1), customer accounts cannot
          access staff operations.
        </p>

        <div
          style={{
            backgroundColor: colors.neutralLight,
            borderRadius: '10px',
            padding: '1rem',
            fontSize: '0.8rem',
            color: colors.neutralDark,
            textAlign: 'left',
            marginBottom: '1.75rem',
            lineHeight: 1.5,
          }}
        >
          <strong>Enforcement:</strong> Verified server-side via Next.js Middleware and
          Postgres Row-Level Security <code>public.is_admin()</code> helper.
        </div>

        <button
          onClick={handleSignOut}
          style={{
            width: '100%',
            backgroundColor: colors.primary,
            color: colors.textInverse,
            padding: '0.85rem',
            borderRadius: '10px',
            border: 'none',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
            boxShadow: '0 4px 8px rgba(106, 27, 122, 0.2)',
          }}
        >
          Sign Out &amp; Return to Login
        </button>
      </div>
    </div>
  );
}
