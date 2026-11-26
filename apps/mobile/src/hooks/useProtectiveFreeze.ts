import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchSecuritySettings, fetchSecurityTimeline } from './usePhase8Contracts';
import { useBantayRealtime, type BantayAlertEvent } from './useBantayRealtime';
import {
  BANTAY_PROTECTIVE_LOCK_NOTIFICATION_TYPE,
  PROTECTIVE_LOCK_EVENT_KIND,
  isProtectiveFreeze,
} from '../utils/protectiveFreeze';

export interface ProtectiveFreezeState {
  /** The existing 8D lock flag from `get_security_settings`. */
  locked: boolean;
  /** Locked plus a real `protective_lock` event in the caller's timeline. */
  protective: boolean;
  unlockAfter: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const INITIAL_STATE: Omit<ProtectiveFreezeState, 'refresh'> = {
  locked: false,
  protective: false,
  unlockAfter: null,
  loading: true,
};

function isRelevantSecurityEvent(event: BantayAlertEvent): boolean {
  return (
    event.severity === 'high' ||
    event.kind === PROTECTIVE_LOCK_EVENT_KIND ||
    event.kind === 'account_locked' ||
    event.kind === 'account_unlocked'
  );
}

function isRelevantNotification(event: BantayAlertEvent): boolean {
  return (
    event.type === BANTAY_PROTECTIVE_LOCK_NOTIFICATION_TYPE ||
    event.type === 'account_alert'
  );
}

/**
 * UI-only view of the existing Bantay protective lock. It reads no new RPCs:
 * `get_security_settings` supplies `locked` and `get_security_timeline`
 * distinguishes a protective freeze from an ordinary account lock. Both the
 * security_events and notifications INSERT streams trigger a refetch, so a
 * lock raised while a screen is open appears within seconds.
 */
export function useProtectiveFreeze(): ProtectiveFreezeState {
  const [state, setState] = useState(INITIAL_STATE);
  const [userId, setUserId] = useState<string | null>(null);
  const mounted = useRef(true);
  const channelToken = useId().replace(/:/g, '');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (typeof supabase.auth?.getUser !== 'function') {
      if (mounted.current) setState({ ...INITIAL_STATE, loading: false });
      return;
    }
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        if (mounted.current) {
          setUserId(null);
          setState({ ...INITIAL_STATE, loading: false });
        }
        return;
      }
      if (mounted.current) setUserId(data.user.id);

      const [settingsRes, timelineRes] = await Promise.all([
        fetchSecuritySettings().catch(() => ({
          data: null,
          error: new Error('read failed'),
        })),
        fetchSecurityTimeline(50).catch(() => ({
          data: [],
          error: new Error('read failed'),
        })),
      ]);
      if (!mounted.current) return;

      const locked = Boolean(settingsRes.data?.locked);
      const events = Array.isArray(timelineRes.data) ? timelineRes.data : [];
      setState({
        locked,
        protective: isProtectiveFreeze(locked, events),
        unlockAfter: settingsRes.data?.unlock_after ?? null,
        loading: false,
      });
    } catch {
      if (mounted.current) setState({ ...INITIAL_STATE, loading: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRealtime = useCallback(() => {
    void refresh();
  }, [refresh]);

  const securityOptions = useMemo(
    () => ({
      channelName: `protective-freeze-events-${channelToken}`,
      shouldHandle: isRelevantSecurityEvent,
    }),
    [channelToken]
  );
  const notificationOptions = useMemo(
    () => ({
      channelName: `protective-freeze-notices-${channelToken}`,
      table: 'notifications' as const,
      shouldHandle: isRelevantNotification,
    }),
    [channelToken]
  );

  useBantayRealtime(userId, handleRealtime, securityOptions);
  useBantayRealtime(userId, handleRealtime, notificationOptions);

  return { ...state, refresh };
}
