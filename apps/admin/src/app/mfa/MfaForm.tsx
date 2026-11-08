'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAdminBrowserClient } from '@/lib/supabase-browser';
import { Button, Input } from '@/components/ui';
import styles from '../login/Login.module.css';

type Enrollment = { id: string; secret: string; qr_code: string; uri: string };
export function MfaForm({ setup = false }: { setup?: boolean }) {
  const router = useRouter();
  const [client] = useState(createAdminBrowserClient);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [factorId, setFactorId] = useState('');
  const pending = useRef<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error: loadError } = await client.auth.mfa.listFactors();
      if (!alive) return;
      if (loadError) {
        setError('Could not load your authenticator. Please sign in again.');
        return;
      }
      const factor = data.totp.find((f) => f.status === 'verified');
      if (factor) setFactorId(factor.id);
      else if (!setup) router.replace('/mfa/setup');
    })();
    return () => {
      alive = false;
      const id = pending.current;
      pending.current = null;
      if (id) void client.auth.mfa.unenroll({ factorId: id });
    };
  }, [client, router, setup]);
  const start = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const { data, error: enrollError } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Davao Bank Admin',
      });
      if (enrollError || !data) {
        setError('Could not begin setup. Please try again.');
        return;
      }
      pending.current = data.id;
      setFactorId(data.id);
      setEnrollment({ id: data.id, ...data.totp });
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };
  const verify = async (value: string) => {
    if (inFlight.current || !factorId || !/^\d{6}$/.test(value)) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const { error: verifyError } = await client.auth.mfa.challengeAndVerify({
        factorId,
        code: value,
      });
      if (verifyError) {
        setError('Code not accepted. Try the latest code from your authenticator app.');
        return;
      }
      pending.current = null;
      const { error: refreshError } = await client.auth.refreshSession();
      if (refreshError) {
        setError('Could not refresh your session. Please try again.');
        return;
      }
      setEnrollment(null);
      router.replace('/');
      router.refresh();
    } catch {
      setError('Could not verify the code. Please try again.');
    } finally {
      setCode('');
      setBusy(false);
      inFlight.current = false;
    }
  };
  const cancel = async () => {
    const id = pending.current;
    if (id) {
      const { error: removeError } = await client.auth.mfa.unenroll({ factorId: id });
      if (removeError) {
        setError('Could not cancel setup. Please try again.');
        return;
      }
      pending.current = null;
    }
    setEnrollment(null);
    await client.auth.signOut();
    router.replace('/login');
    router.refresh();
  };
  return (
    <main className={styles.container}>
      <section className={styles.loginCard}>
        <h1>{setup ? 'Set up two-step verification' : 'Verify your sign-in'}</h1>
        <p>Use an authenticator app to secure access to the staff console.</p>
        {error && <p role="alert">{error}</p>}
        {setup && !factorId && (
          <Button onClick={() => void start()} disabled={busy}>
            Set up authenticator
          </Button>
        )}
        {enrollment && (
          <div>
            <img
              src={enrollment.qr_code}
              alt="Authenticator setup QR code"
              width={200}
              height={200}
            />
            <p>
              Setup key: <code>{enrollment.secret}</code>
            </p>
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(enrollment.secret);
              }}
            >
              Copy setup key
            </Button>
            <a href={enrollment.uri}>Open in authenticator app</a>
          </div>
        )}
        {!!factorId && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void verify(code);
            }}
          >
            <Input
              label="Authenticator code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              disabled={busy}
              onChange={(event) => {
                const value = event.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(value);
                if (value.length === 6) void verify(value);
              }}
            />
            <Button type="submit" disabled={busy || code.length !== 6}>
              Verify code
            </Button>
          </form>
        )}
        <Button variant="ghost" disabled={busy} onClick={() => void cancel()}>
          Cancel and sign out
        </Button>
      </section>
    </main>
  );
}
