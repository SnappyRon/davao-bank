import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@davao-bank/shared';
import { Text } from './Text';

export interface LogoProps {
  variant?: 'mark' | 'horizontal';
  size?: number;
  style?: ViewStyle;
}

export function Logo({ variant = 'mark', size = 40, style }: LogoProps) {
  if (variant === 'horizontal') {
    return (
      <View style={[styles.horizontalContainer, style]}>
        <View
          style={[
            styles.placeholderMark,
            { width: size, height: size, borderRadius: size * 0.28 },
          ]}
        >
          <Text
            variant="caption"
            color={colors.ink}
            style={[styles.placeholderText, { fontSize: size * 0.3 }]}
          >
            LOGO
          </Text>
        </View>
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
      style={[
        styles.placeholderMark,
        { width: size, height: size, borderRadius: size * 0.28 },
        style,
      ]}
    >
      <Text
        variant="caption"
        color={colors.ink}
        style={[styles.placeholderText, { fontSize: size * 0.3 }]}
      >
        LOGO
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  horizontalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  placeholderMark: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  brandTitle: {
    fontWeight: '800',
  },
});
