import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing } from '@davao-bank/shared';
import { useAppBackgrounded } from '../hooks/useAppBackgrounded';
import { Logo } from './Logo';
import { Text } from './Text';

interface PrivacyOverlayProps {
  forceVisible?: boolean;
}

export function PrivacyOverlay({ forceVisible }: PrivacyOverlayProps) {
  const isBackgrounded = useAppBackgrounded();
  const show = forceVisible ?? isBackgrounded;

  if (!show) {
    return null;
  }

  return (
    <View style={styles.privacyOverlay} testID="privacy-overlay" pointerEvents="auto">
      <Logo size={64} />
      <Text variant="title" style={styles.privacyTitle}>
        Davao Bank
      </Text>
      <Text variant="caption" style={styles.privacySubtitle}>
        Secured Banking Session
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  privacyOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999999,
    elevation: 999999,
  },
  privacyTitle: {
    marginTop: spacing.md,
    color: colors.primary,
  },
  privacySubtitle: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
  },
});
