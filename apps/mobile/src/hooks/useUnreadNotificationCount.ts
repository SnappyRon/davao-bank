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
 *   notifications as read.
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

  return { count, setCount, refresh };
}
