import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface BantayAlertEvent {
  kind?: string | null;
  severity?: string | null;
  /** Notifications use `type`; security events use `kind`. */
  type?: string | null;
}

export interface BantayRealtimeOptions {
  /** Override the channel name when a second consumer needs its own channel. */
  channelName?: string;
  /** Subscribe to notifications instead of security_events. */
  table?: 'security_events' | 'notifications';
  /** Default keeps the original high-severity-only bridge behaviour. */
  shouldHandle?: (event: BantayAlertEvent) => boolean;
}

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];
const DEFAULT_SHOULD_HANDLE = (event: BantayAlertEvent): boolean =>
  event.severity === 'high';

/**
 * One Realtime channel for the signed-in caller's source-table INSERTs.
 * RLS plus the user_id filter keep another customer's rows off this channel.
 * The channel is removed on sign-out, unmount and transport failure; a failed
 * channel retries with backoff, never in parallel. The callback and options
 * are held in refs so changing a handler cannot resubscribe on every render.
 */
export function useBantayRealtime(
  userId: string | null,
  onHighAlert: (event: BantayAlertEvent) => void,
  options: BantayRealtimeOptions = {}
) {
  const onHighAlertRef = useRef(onHighAlert);
  onHighAlertRef.current = onHighAlert;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!userId || typeof supabase.channel !== 'function') return;

    let disposed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: RealtimeChannel | null = null;
    const table = optionsRef.current.table ?? 'security_events';

    const openChannel = () => {
      if (disposed) return;
      let failed = false;
      const channelOptions = optionsRef.current;
      const name =
        channelOptions.channelName ??
        (table === 'security_events'
          ? `security_events:${userId}`
          : `${table}:${userId}`);
      const shouldHandle = channelOptions.shouldHandle ?? DEFAULT_SHOULD_HANDLE;
      const next = supabase.channel(name).on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table,
          filter: `user_id=eq.${userId}`,
        },
        (payload: { new?: BantayAlertEvent }) => {
          if (!disposed && payload?.new && shouldHandle(payload.new)) {
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
