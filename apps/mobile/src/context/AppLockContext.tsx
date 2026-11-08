import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, ActivityIndicator, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { LockScreen } from '../screens/LockScreen';

const KEY = 'davao_bank_app_lock';
export const shouldLockAfterBackground = (since: number | null, now: number) =>
  since !== null && now - since > 120_000;
const Context = createContext<{
  enabled: boolean;
  setEnabled: (value: boolean) => Promise<void>;
} | null>(null);
export function AppLockProvider({
  children,
  restoredSession,
}: {
  children: React.ReactNode;
  restoredSession: boolean;
}) {
  const [enabled, setEnabledState] = useState(false);
  const [locked, setLocked] = useState(true);
  const [ready, setReady] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const enabledRef = useRef(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const stored = await SecureStore.getItemAsync(KEY);
        const next =
          stored === null
            ? await LocalAuthentication.isEnrolledAsync()
            : stored === 'true';
        if (!alive) return;
        enabledRef.current = next;
        setEnabledState(next);
        setLocked(next && restoredSession);
      } catch {
        // Storage uncertainty must not reveal a restored session.
        if (alive) {
          enabledRef.current = true;
          setEnabledState(true);
          setLocked(restoredSession);
        }
      } finally {
        if (alive) setReady(true);
      }
    })();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && backgroundedAt.current === null)
        backgroundedAt.current = Date.now();
      if (state === 'active') {
        if (
          enabledRef.current &&
          shouldLockAfterBackground(backgroundedAt.current, Date.now())
        )
          setLocked(true);
        backgroundedAt.current = null;
      }
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [restoredSession]);
  const setEnabled = async (value: boolean) => {
    await SecureStore.setItemAsync(KEY, String(value));
    enabledRef.current = value;
    setEnabledState(value);
  };
  return (
    <Context.Provider value={{ enabled, setEnabled }}>
      {!ready ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : locked ? (
        <LockScreen onUnlock={() => setLocked(false)} />
      ) : (
        children
      )}
    </Context.Provider>
  );
}
export function useAppLock() {
  const context = useContext(Context);
  if (!context) throw new Error('AppLockProvider is required');
  return context;
}
