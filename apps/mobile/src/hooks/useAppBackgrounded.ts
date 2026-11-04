import { useState, useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Hook to detect when the app is backgrounded or inactive (e.g., in app switcher).
 * Used to blur or overlay sensitive banking information across the root app and open modals.
 */
export function useAppBackgrounded(): boolean {
  const [isBackgrounded, setIsBackgrounded] = useState<boolean>(() => {
    const current = AppState.currentState;
    return current === 'inactive' || current === 'background';
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      setIsBackgrounded(nextState === 'inactive' || nextState === 'background');
    });

    return () => {
      sub.remove();
    };
  }, []);

  return isBackgrounded;
}
