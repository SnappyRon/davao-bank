'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  ArrowLeftRight,
  ClipboardList,
  CalendarClock,
  Building2,
  LogOut,
  Menu,
} from 'lucide-react';
import { createAdminBrowserClient } from '@/lib/supabase-browser';
import styles from './Sidebar.module.css';

interface SidebarProps {
  adminEmail?: string | null;
  adminName?: string | null;
}

export function Sidebar({ adminEmail, adminName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    const supabase = createAdminBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    { label: 'Dashboard', href: '/', icon: <LayoutDashboard size={20} /> },
    { label: 'Users', href: '/users', icon: <Users size={20} /> },
    { label: 'Accounts', href: '/accounts', icon: <CreditCard size={20} /> },
    { label: 'Transactions', href: '/transactions', icon: <ArrowLeftRight size={20} /> },
    { label: 'Schedules', href: '/schedules', icon: <CalendarClock size={20} /> },
    { label: 'Billers', href: '/billers', icon: <Building2 size={20} /> },
    { label: 'Audit Log', href: '/audit', icon: <ClipboardList size={20} /> },
  ];

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) {
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (email) return email.substring(0, 2).toUpperCase();
    return 'AD';
  };

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className={`${styles.mobileBackdrop} ${mobileOpen ? styles.open : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      <aside className={`${styles.sidebar} ${mobileOpen ? styles.mobileOpen : ''}`}>
        <div className={styles.brandHeader}>
          <Link href="/" className={styles.brandLogoRow}>
            <div className={styles.logoPlaceholder}>
              <img src="/brand/davao-bank-mark.svg" alt="" width={34} height={34} />
            </div>
            <div>
              <div className={styles.brandName}>Davao Bank</div>
              <div className={styles.consoleBadge}>STAFF CONSOLE</div>
            </div>
          </Link>
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => {
            const isActive =
              item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                title={item.label}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.footer}>
          <div className={styles.adminInfo}>
            <div className={styles.adminAvatar}>{getInitials(adminName, adminEmail)}</div>
            <div className={styles.adminDetails}>
              <div className={styles.adminName}>{adminName || 'Staff Admin'}</div>
              <div className={styles.adminEmail}>{adminEmail || ''}</div>
            </div>
          </div>

          <button onClick={handleSignOut} className={styles.signOutButton}>
            <LogOut size={16} />
            <span className={styles.signOutText}>Sign Out</span>
          </button>

          <p className={styles.creditText}>
            Mt. Apo emblem: original artwork for Davao Bank, inspired by Kadayawan.
          </p>
        </div>
      </aside>
    </>
  );
}

export function MobileNavToggle({ onToggle }: { onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={styles.mobileToggle}
      aria-label="Toggle navigation menu"
    >
      <Menu size={20} />
    </button>
  );
}
