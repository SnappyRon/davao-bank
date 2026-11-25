import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface BantayAlertEvent {
  kind?: string | null;
  severity?: string | null;
}

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];

/**
 * One Realtime channel for the signed-in caller's security_events INSERTs.
 * RLS (security_events_select_own) plus the user_id filter keep another
 * customer's rows off this channel. The channel is removed on sign-out,
 * unmount and transport failure; a failed channel retries with backoff, never
 * in parallel. The callback is held in a ref so a changing handler cannot
 * resubscribe on every render.
 */
export function useBantayRealtime(
  userId: string | null,
  onHighAlert: (event: BantayAlertEvent) => void
) {
  const onHighAlertRef = useRef(onHighAlert);
  onHighAlertRef.current = onHighAlert;

  useEffect(() => {
    if (!userId || typeof supabase.channel !== 'function') return;

    let disposed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: RealtimeChannel | null = null;

    const openChannel = () => {
      if (disposed) return;
      let failed = false;
      const next = supabase.channel(`security_events:${userId}`).on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'security_events',
          filter: `user_id=eq.${userId}`,
        },
        (payload: { new?: BantayAlertEvent }) => {
          if (!disposed && payload?.new?.severity === 'high') {
            onHighAlertRef.current(payload.new);
          }
        }
      );
      channel = next;

      next.subscribe((status: string) => {
        if (disposed || failed) return;
        if (status === 'SUBSCRIBED') {
          attempt = 0;
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          failed = true;
          void supabase.removeChannel(next);
          if (retryTimer) return;
          const delay =
            RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
          attempt += 1;
          retryTimer = setTimeout(() => {
            retryTimer = null;
            openChannel();
          }, delay);
        }
      });
    };

    openChannel();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    };
  }, [userId]);
}
