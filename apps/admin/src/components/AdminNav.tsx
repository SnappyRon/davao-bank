'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createAdminBrowserClient } from '@/lib/supabase-browser';
import styles from './AdminNav.module.css';

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
    { label: 'Schedules', href: '/schedules' },
    { label: 'Billers', href: '/billers' },
    { label: 'Audit Log', href: '/audit' },
  ];

  return (
    <header className={styles.header}>
      {/* Brand & Navigation Links */}
      <div className={styles.brandGroup}>
        <Link href="/" className={styles.brandLink}>
          <div className={styles.brandBadge}>DB</div>
          <div>
            <div className={styles.brandTitle}>Davao Bank</div>
            <div className={styles.brandSubtitle}>Staff Portal</div>
          </div>
        </Link>

        <nav className={styles.nav}>
          {navItems.map((item) => {
            const isActive =
              item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={isActive ? styles.navLinkActive : styles.navLink}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Staff User & Sign Out */}
      <div className={styles.userGroup}>
        <div className={styles.userInfo}>
          <div className={styles.userName}>{adminName || 'Bank Administrator'}</div>
          <div className={styles.userEmail}>
            {adminEmail || 'admin@davaobank.ph'} &bull; Operations
          </div>
        </div>

        <button onClick={handleSignOut} className={styles.signOutBtn}>
          Sign Out
        </button>
      </div>
    </header>
  );
}
