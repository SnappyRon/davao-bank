'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { colors } from '@davao-bank/shared';
import { createAdminBrowserClient } from '@/lib/supabase-browser';

interface AdminNavProps {
  adminEmail?: string | null;
  adminName?: string | null;
}

export function AdminNav({ adminEmail, adminName }: AdminNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createAdminBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    { label: 'Dashboard', href: '/' },
    { label: 'Users', href: '/users' },
    { label: 'Accounts', href: '/accounts' },
    { label: 'Transactions', href: '/transactions' },
    { label: 'Audit Log', href: '/audit' },
  ];

  return (
    <header
      style={{
        backgroundColor: colors.primary,
        color: colors.textInverse,
        padding: '0.875rem 2rem',
        boxShadow: '0 2px 8px rgba(106, 27, 122, 0.25)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
      }}
    >
      {/* Brand & Navigation Links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: colors.accent,
              color: colors.textPrimary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1rem',
              letterSpacing: '0.5px',
            }}
          >
            DB
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2 }}>
              Davao Bank
            </div>
            <div
              style={{
                fontSize: '0.72rem',
                opacity: 0.85,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Staff Portal
            </div>
          </div>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {navItems.map((item) => {
            const isActive =
              item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: '0.5rem 0.875rem',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: isActive ? 700 : 500,
                  backgroundColor: isActive ? 'rgba(255, 255, 255, 0.18)' : 'transparent',
                  color: colors.textInverse,
                  transition: 'background-color 0.15s ease',
                  borderBottom: isActive
                    ? `2px solid ${colors.accent}`
                    : '2px solid transparent',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Staff User & Sign Out */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>
            {adminName || 'Bank Administrator'}
          </div>
          <div style={{ fontSize: '0.72rem', opacity: 0.8 }}>
            {adminEmail || 'admin@davaobank.ph'} &bull; Operations
          </div>
        </div>

        <button
          onClick={handleSignOut}
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.12)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            color: colors.textInverse,
            padding: '0.45rem 0.875rem',
            borderRadius: '6px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.22)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)')
          }
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
