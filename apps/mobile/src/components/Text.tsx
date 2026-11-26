import React from 'react';
import {
  Text as RNText,
  StyleSheet,
  Platform,
  type TextProps as RNTextProps,
} from 'react-native';
import { colors, typography } from '@davao-bank/shared';

export type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'title'
  | 'bodyStrong'
  | 'body'
  | 'label'
  | 'caption'
  | 'amount';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
  tabularNums?: boolean;
  align?: 'left' | 'center' | 'right';
  children?: React.ReactNode;
  /** React 19 passes `ref` as a prop; it reaches the native Text via `rest`. */
  ref?: React.Ref<React.ComponentRef<typeof RNText>>;
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
  const combined = [
    styles.base,
    fontStyle,
    { color },
    tabularNums && styles.tabularNums,
    align && { textAlign: align },
    style,
  ];

  // On iOS, remove fontWeight when custom fontFamily is set so iOS doesn't apply synthetic bold
  const resolvedStyle =
    Platform.OS === 'ios'
      ? (() => {
          const flat = StyleSheet.flatten(combined) as any;
          if (flat && flat.fontFamily) {
            return { ...flat, fontWeight: undefined };
          }
          return combined;
        })()
      : combined;

  return (
    <RNText style={resolvedStyle} {...rest}>
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
