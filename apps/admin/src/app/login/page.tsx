'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { createAdminBrowserClient } from '@/lib/supabase-browser';
import { Input, Button } from '@/components/ui';
import styles from './Login.module.css';

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
    <div className={styles.container}>
      <div className={styles.loginCard}>
        <div className={styles.brandHeader}>
          <div className={styles.logoBadge}>DB</div>
          <h1 className={styles.brandTitle}>Davao Bank</h1>
          <div className={styles.consoleSubtitle}>STAFF CONSOLE</div>
        </div>

        {errorMessage ? <div className={styles.errorBanner}>{errorMessage}</div> : null}

        <form onSubmit={handleLogin} className={styles.form}>
          <Input
            label="Staff Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@davaobank.ph"
            autoComplete="email"
            required
          />

          <Input
            label="Security Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            icon={<LogIn size={18} />}
            fullWidth
            className={styles.submitBtn}
          >
            Sign In to Staff Console
          </Button>
        </form>

        <p className={styles.disclaimer}>
          Restricted to authorized personnel only. All access, sessions, and operations
          are cryptographically audited and recorded under regulatory oversight.
        </p>
      </div>
    </div>
  );
}
