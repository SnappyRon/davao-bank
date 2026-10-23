'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ShieldX, LogOut } from 'lucide-react';
import { createAdminBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui';

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
        backgroundColor: 'var(--color-canvas)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-xl)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-2xl)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-soft)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: 'var(--radius-pill)',
            backgroundColor: 'var(--color-tint-red)',
            color: 'var(--color-red-text)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 'var(--space-lg)',
          }}
        >
          <ShieldX size={32} />
        </div>

        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 800,
            color: 'var(--color-ink)',
            marginBottom: 'var(--space-sm)',
          }}
        >
          Access Denied
        </h1>

        <p
          style={{
            fontSize: '0.9375rem',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.5,
            marginBottom: 'var(--space-xl)',
          }}
        >
          You do not have administrative privileges to access the Davao Bank Staff
          Console. This system is strictly restricted to authorized staff and management.
        </p>

        <Button
          variant="destructive"
          onClick={handleSignOut}
          icon={<LogOut size={16} />}
          fullWidth
        >
          Sign Out & Return to Login
        </Button>
      </div>
    </div>
  );
}
