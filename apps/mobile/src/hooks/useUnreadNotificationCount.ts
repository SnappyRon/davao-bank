import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';

/**
 * Unread Inbox count for the tab badge (spec 7B.0/7B.2: loaded when the app
 * starts, not only after Inbox has been opened).
 *
 * - loads as soon as there is a signed-in user (restored session or sign-in);
 * - refreshes when the app comes back to the foreground;
 * - resets to 0 on sign-out;
 * - Inbox reports its own count through `setCount` after it loads or marks
 *   notifications as read; that wins over any refresh still in flight.
 * - the query is scoped to the user (RLS alone would also let an admin
 *   account count everyone's rows).
 */
export function useUnreadNotificationCount(userId: string | null) {
  const [count, setCount] = useState(0);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const requestId = ++requestIdRef.current;
    try {
      const { count: unread } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false);
      if (requestId === requestIdRef.current && typeof unread === 'number') {
        setCount(unread);
      }
    } catch {
      // Non-critical: the badge keeps its last value.
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      requestIdRef.current += 1;
      setCount(0);
      return;
    }
    void refresh();
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [userId, refresh]);

  /**
   * Inbox reports its own count. Bumping the request id makes any refresh
   * still in flight drop its (older) result instead of overwriting it.
   */
  const reportCount = useCallback((value: number) => {
    requestIdRef.current += 1;
    setCount(value);
  }, []);

  return { count, setCount: reportCount, refresh };
}
