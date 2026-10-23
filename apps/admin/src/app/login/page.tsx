'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { colors } from '@davao-bank/shared';
import { createAdminBrowserClient } from '@/lib/supabase-browser';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const supabase = createAdminBrowserClient();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        // Enforce role check on client immediately in addition to server middleware
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profile?.role !== 'admin') {
          await supabase.auth.signOut();
          setErrorMessage(
            'Access Denied: This portal is restricted to Davao Bank administrative staff.'
          );
          setLoading(false);
          return;
        }

        router.push('/');
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setLoading(false);
    }
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
          maxWidth: '440px',
          backgroundColor: colors.surface,
          borderRadius: '20px',
          padding: '2.5rem',
          border: `1px solid ${colors.border}`,
          boxShadow:
            '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03)',
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              backgroundColor: colors.primary,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.4rem',
              color: colors.textInverse,
              boxShadow: '0 4px 12px rgba(106, 27, 122, 0.25)',
              marginBottom: '1rem',
            }}
          >
            DB
          </div>
          <h1
            style={{
              fontSize: '1.6rem',
              fontWeight: 800,
              color: colors.primary,
              letterSpacing: '-0.02em',
              marginBottom: '0.35rem',
            }}
          >
            Davao Bank Admin
          </h1>
          <p
            style={{
              fontSize: '0.85rem',
              color: colors.textSecondary,
              fontWeight: 500,
            }}
          >
            Staff &amp; Operations Portal
          </p>
        </div>

        {errorMessage && (
          <div
            style={{
              backgroundColor: colors.errorLight,
              border: `1px solid ${colors.error}`,
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              marginBottom: '1.5rem',
              color: colors.error,
              fontSize: '0.85rem',
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                fontSize: '0.825rem',
                fontWeight: 700,
                color: colors.textPrimary,
                marginBottom: '0.4rem',
              }}
            >
              Staff Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@davaobank.ph"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.background,
                fontSize: '0.95rem',
                color: colors.textPrimary,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.75rem' }}>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                fontSize: '0.825rem',
                fontWeight: 700,
                color: colors.textPrimary,
                marginBottom: '0.4rem',
              }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.background,
                fontSize: '0.95rem',
                color: colors.textPrimary,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              backgroundColor: colors.primary,
              color: colors.textInverse,
              padding: '0.85rem',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 8px rgba(106, 27, 122, 0.2)',
              transition: 'opacity 0.15s ease',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Authenticating Staff...' : 'Staff Sign In'}
          </button>
        </form>

        <div
          style={{
            marginTop: '2rem',
            paddingTop: '1.25rem',
            borderTop: `1px solid ${colors.border}`,
            textAlign: 'center',
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              color: colors.textSecondary,
              display: 'block',
              lineHeight: 1.5,
            }}
          >
            <strong>Security Notice:</strong> Administrative access is restricted to
            authorized personnel. Public self-signup is disabled.
          </span>
        </div>
      </div>
    </div>
  );
}
