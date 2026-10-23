import React from 'react';
import { StyleSheet, type TextStyle } from 'react-native';
import { colors, formatCentavosToPHP } from '@davao-bank/shared';
import { Text, type TextVariant } from './Text';

export interface AmountTextProps {
  amountCentavos: number;
  direction?: 'incoming' | 'outgoing' | 'neutral';
  hidden?: boolean;
  variant?: TextVariant;
  color?: string;
  style?: TextStyle;
  showSign?: boolean;
}

export function AmountText({
  amountCentavos,
  direction = 'neutral',
  hidden = false,
  variant = 'display',
  color,
  style,
  showSign = true,
}: AmountTextProps) {
  if (hidden) {
    return (
      <Text
        variant={variant}
        color={color || colors.ink}
        tabularNums
        style={[styles.base, style]}
        accessibilityLabel="Balance hidden"
      >
        ₱••••••
      </Text>
    );
  }

  const formatted = formatCentavosToPHP(Math.abs(amountCentavos));

  let displayColor = color;
  let sign = '';

  if (direction === 'incoming') {
    displayColor = color || colors.primary;
    sign = showSign ? '+' : '';
  } else if (direction === 'outgoing') {
    displayColor = color || colors.ink;
    sign = showSign ? '−' : '';
  } else {
    displayColor = color || colors.ink;
  }

  return (
    <Text variant={variant} color={displayColor} tabularNums style={[styles.base, style]}>
      {sign}
      {formatted}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontVariant: ['tabular-nums'],
  },
});
