import React from 'react';
import { Text as RNText, StyleSheet, type TextProps as RNTextProps } from 'react-native';
import { colors, typography } from '@davao-bank/shared';

export type TextVariant =
  'display' | 'h1' | 'h2' | 'title' | 'bodyStrong' | 'body' | 'label' | 'caption';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
  tabularNums?: boolean;
  align?: 'left' | 'center' | 'right';
  children?: React.ReactNode;
}

export function Text({
  variant = 'body',
  color = colors.ink,
  tabularNums = false,
  align,
  style,
  children,
  ...rest
}: TextProps) {
  const fontStyle = typography[variant] || typography.body;

  return (
    <RNText
      style={[
        styles.base,
        fontStyle,
        { color },
        tabularNums && styles.tabularNums,
        align && { textAlign: align },
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  base: {
    fontFamily: typography.fontFamily,
  },
  tabularNums: {
    fontVariant: ['tabular-nums'],
  },
});
