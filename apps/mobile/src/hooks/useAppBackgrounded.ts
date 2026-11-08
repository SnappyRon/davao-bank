import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

const subscribe = (changed: () => void) => {
  const subscription = AppState.addEventListener('change', changed);
  return () => subscription.remove();
};
const snapshot = () =>
  AppState.currentState === 'inactive' || AppState.currentState === 'background';

/** Read the current native state on render, avoiding stale per-overlay state after a prompt closes. */
export function useAppBackgrounded(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
