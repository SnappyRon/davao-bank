import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff } from 'lucide-react-native';
import { colors, spacing } from '@davao-bank/shared';
import { Text } from './Text';
import {
  getIsOffline,
  installFetchNetworkMonitor,
  probeNetworkConnectivity,
  subscribeNetworkStatus,
} from '../lib/networkStatus';

export const OFFLINE_BANNER_TEXT = "You're offline — showing your last update";
const RECONNECT_POLL_MS = 10000;

/**
 * App-level offline indicator (spec 7B.11).
 * Automatically detects fetch failures and clears itself when connectivity returns.
 */
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState<boolean>(() => getIsOffline());
  const wasOfflineRef = useRef(offline);

  useEffect(() => {
    const uninstall = installFetchNetworkMonitor();
    setOffline(getIsOffline());
    const unsubscribe = subscribeNetworkStatus(setOffline);
    return () => {
      unsubscribe();
      uninstall();
    };
  }, []);

  useEffect(() => {
    if (offline && !wasOfflineRef.current) {
      AccessibilityInfo.announceForAccessibility(OFFLINE_BANNER_TEXT);
    }
    wasOfflineRef.current = offline;
  }, [offline]);

  useEffect(() => {
    if (!offline) return;

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void probeNetworkConnectivity();
      }
    });
    const timer = setInterval(() => {
      void probeNetworkConnectivity();
    }, RECONNECT_POLL_MS);

    return () => {
      appStateSub.remove();
      clearInterval(timer);
    };
  }, [offline]);

  if (!offline) return null;

  return (
    <View
      testID="offline-banner"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.banner, { paddingTop: Math.max(insets.top, spacing.sm) }]}
    >
      <WifiOff size={16} color={colors.orangeText} />
      <Text variant="caption" color={colors.ink} style={styles.text}>
        {OFFLINE_BANNER_TEXT}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tintOrange,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.screenSide,
  },
  text: {
    flexShrink: 1,
  },
});
