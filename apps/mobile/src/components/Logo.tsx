import React from 'react';
import { Image, View, StyleSheet, type ViewStyle } from 'react-native';
import { colors, spacing } from '@davao-bank/shared';
import { Text } from './Text';

// Davao Bank emblem: Mt. Apo over a woven Kadayawan band (source: packages/shared/assets/brand).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- React Native static image asset
const mark = require('../../assets/brand/logo-mark.png');

export interface LogoProps {
  variant?: 'mark' | 'horizontal';
  size?: number;
  style?: ViewStyle;
}

export function Logo({ variant = 'mark', size = 40, style }: LogoProps) {
  const emblem = (
    <Image
      source={mark}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );

  if (variant === 'horizontal') {
    return (
      <View
        style={[styles.horizontalContainer, style]}
        accessible
        accessibilityRole="image"
        accessibilityLabel="Davao Bank"
      >
        {emblem}
        <Text
          variant="h2"
          color={colors.primary}
          style={[styles.brandTitle, { fontSize: size * 0.55 }]}
        >
          Davao Bank
        </Text>
      </View>
    );
  }

  return (
    <View
      style={style}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Davao Bank"
    >
      {emblem}
    </View>
  );
}

const styles = StyleSheet.create({
  horizontalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  brandTitle: {
    fontWeight: '800',
  },
});
