'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './ui/Sidebar';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { createAdminBrowserClient } from '../lib/supabase-browser';
import styles from './AdminShell.module.css';

interface AdminShellProps {
  adminEmail?: string | null;
  adminName?: string | null;
  children: React.ReactNode;
}

const IDLE_TIMEOUT_MS =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TEST_IDLE_TIMEOUT_MS
    ? parseInt(process.env.NEXT_PUBLIC_TEST_IDLE_TIMEOUT_MS, 10)
    : 15 * 60 * 1000; // 15 minutes
const WARNING_TIMEOUT_MS =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TEST_WARNING_TIMEOUT_MS
    ? parseInt(process.env.NEXT_PUBLIC_TEST_WARNING_TIMEOUT_MS, 10)
    : 14 * 60 * 1000; // 14 minutes (1-minute warning)

export function AdminShell({ adminEmail, adminName, children }: AdminShellProps) {
  const [showWarning, setShowWarning] = useState(false);
  const lastActiveRef = useRef<number>(Date.now());

  const resetActivity = useCallback(() => {
    lastActiveRef.current = Date.now();
    setShowWarning(false);
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      const supabase = createAdminBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // Ignore cleanup errors
    } finally {
      window.location.href = '/login?reason=idle_timeout';
    }
  }, []);

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    const handleUserActivity = () => {
      // If warning is not active, bump activity timestamp
      if (!showWarning) {
        lastActiveRef.current = Date.now();
      }
    };

    events.forEach((event) => {
      window.addEventListener(event, handleUserActivity, { passive: true });
    });

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActiveRef.current;
      if (elapsed >= IDLE_TIMEOUT_MS) {
        handleSignOut();
      } else if (elapsed >= WARNING_TIMEOUT_MS) {
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    }, 5000);

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });
      clearInterval(interval);
    };
  }, [showWarning, handleSignOut]);

  return (
    <div className={styles.shell}>
      <Sidebar adminEmail={adminEmail} adminName={adminName} />

      <div className={styles.mainArea}>
        <header className={styles.mobileTopBar}>
          <div className={styles.mobileBrand}>
            <span>Davao Bank</span>
            <span className={styles.consoleBadge}>STAFF CONSOLE</span>
          </div>
          <button
            onClick={() => {
              const aside = document.querySelector('aside');
              if (aside) aside.classList.toggle('mobileOpen');
            }}
            className={styles.mobileMenuBtn}
            aria-label="Toggle menu"
          >
            <Menu size={20} />
          </button>
        </header>

        <main className={styles.mainContent}>{children}</main>
      </div>

      <ConfirmDialog
        isOpen={showWarning}
        onClose={resetActivity}
        onConfirm={resetActivity}
        title="Session Inactivity Warning"
        description="For security compliance, staff sessions expire after 15 minutes of inactivity. Your session will be closed in 1 minute."
        confirmText="Stay Signed In"
        variant="warning"
        requireReason={false}
      />
    </div>
  );
}
