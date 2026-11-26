'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toUserMessage } from '@davao-bank/shared';
import { createAdminBrowserClient } from '@/lib/supabase-browser';

export type ServiceLoadStatus =
  'loading' | 'ready' | 'empty' | 'error' | 'offline' | 'denied';

export interface ServiceLoadState<T> {
  status: ServiceLoadStatus;
  data: T[];
  error: string | null;
}

/**
 * Shared read path for the two staff service screens. The RPCs themselves call
 * assert_admin_aal2(); this hook mirrors that guard for the visible UI state.
 */
export function useAdminServiceData<T>(
  rpcName: string,
  args: Record<string, unknown>
): {
  state: ServiceLoadState<T>;
  reload: () => void;
  client: ReturnType<typeof createAdminBrowserClient>;
} {
  const client = useMemo(() => createAdminBrowserClient(), []);
  const argsKey = useMemo(() => JSON.stringify(args), [args]);
  const [online, setOnline] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<ServiceLoadState<T>>({
    status: 'loading',
    data: [],
    error: null,
  });

  useEffect(() => {
    setOnline(navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!online) {
      setState({ status: 'offline', data: [], error: null });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading', data: [], error: null });

    void (async () => {
      try {
        const { data: assurance, error: aalError } =
          await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (cancelled) return;
        if (aalError || assurance?.currentLevel !== 'aal2') {
          setState({ status: 'denied', data: [], error: null });
          return;
        }

        const { data, error } = await client.rpc(rpcName, JSON.parse(argsKey));
        if (cancelled) return;
        if (error) {
          setState({ status: 'error', data: [], error: toUserMessage(error, 'load') });
          return;
        }

        const rows = Array.isArray(data) ? (data as T[]) : [];
        setState({
          status: rows.length === 0 ? 'empty' : 'ready',
          data: rows,
          error: null,
        });
      } catch (error) {
        if (!cancelled) {
          setState({ status: 'error', data: [], error: toUserMessage(error, 'load') });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [argsKey, client, nonce, online, rpcName]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { state, reload, client };
}
