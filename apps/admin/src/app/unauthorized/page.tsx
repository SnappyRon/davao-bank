'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ShieldX, LogOut } from 'lucide-react';
import { createAdminBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui';
import styles from './Unauthorized.module.css';

export default function UnauthorizedPage() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createAdminBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.iconWrapper}>
          <ShieldX size={32} />
        </div>

        <h1 className={styles.title}>Access Denied</h1>

        <p className={styles.description}>
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
