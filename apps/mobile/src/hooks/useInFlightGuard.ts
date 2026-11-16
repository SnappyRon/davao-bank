import { useCallback, useRef } from 'react';

/**
 * Runs a money action at most once at a time (spec 7B.11: "more taps are
 * ignored"). The ref is set before the first await, so two presses in the
 * same frame start one action, not two. The action itself is not changed.
 */
export function useInFlightGuard() {
  const inFlight = useRef(false);
  return useCallback(async <T>(action: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    try {
      return await action();
    } finally {
      inFlight.current = false;
    }
  }, []);
}
