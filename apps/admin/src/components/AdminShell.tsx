'use client';

import React from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './ui/Sidebar';
import styles from './AdminShell.module.css';

interface AdminShellProps {
  adminEmail?: string | null;
  adminName?: string | null;
  children: React.ReactNode;
}

export function AdminShell({ adminEmail, adminName, children }: AdminShellProps) {
  return (
    <div className={styles.shell}>
      <Sidebar adminEmail={adminEmail} adminName={adminName} />

      <div className={styles.mainArea}>
        <header className={styles.mobileTopBar}>
          <div className={styles.mobileBrand}>
            <span>Davao Bank</span>
            <span
              style={{
                fontSize: '0.6875rem',
                color: 'var(--color-text-secondary)',
                fontWeight: 600,
              }}
            >
              STAFF CONSOLE
            </span>
          </div>
          <button
            onClick={() => {
              const aside = document.querySelector('aside');
              if (aside) aside.classList.toggle('mobileOpen');
            }}
            style={{
              background: 'none',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '0.375rem',
              cursor: 'pointer',
              color: 'var(--color-ink)',
              display: 'flex',
            }}
            aria-label="Toggle menu"
          >
            <Menu size={20} />
          </button>
        </header>

        <main className={styles.mainContent}>{children}</main>
      </div>
    </div>
  );
}
