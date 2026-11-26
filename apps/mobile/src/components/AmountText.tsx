import React, { useEffect, useRef } from 'react';
import { StyleSheet, type TextStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, formatCentavosToPHP, motion } from '@davao-bank/shared';
import { Text, type TextVariant } from './Text';

export interface AmountTextProps {
  amountCentavos: number;
  direction?: 'incoming' | 'outgoing' | 'neutral';
  hidden?: boolean;
  variant?: TextVariant;
  color?: string;
  style?: TextStyle;
  showSign?: boolean;
  /** Caps text scaling on amounts (spec 7B.6: 1.4). */
  maxFontSizeMultiplier?: number;
}

export function AmountText({
  amountCentavos,
  direction = 'neutral',
  hidden = false,
  variant = 'display',
  color,
  style,
  showSign = true,
  maxFontSizeMultiplier = 1.4,
}: AmountTextProps) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  const isFirstMount = useRef(true);
  const prevValRef = useRef({ amountCentavos, hidden });

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    if (
      prevValRef.current.amountCentavos !== amountCentavos ||
      prevValRef.current.hidden !== hidden
    ) {
      try {
        Haptics.selectionAsync();
      } catch {
        // Haptics optional
      }

      if (!reduceMotion) {
        opacity.value = 0.2;
        opacity.value = withTiming(1, { duration: motion.duration.short });
      } else {
        opacity.value = 1;
      }
      prevValRef.current = { amountCentavos, hidden };
    }
  }, [amountCentavos, hidden, reduceMotion, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (hidden) {
    return (
      <Animated.View style={animatedStyle}>
        <Text
          variant={variant}
          color={color || colors.ink}
          tabularNums
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={[styles.base, style]}
          accessibilityLabel="Amount hidden"
          maxFontSizeMultiplier={maxFontSizeMultiplier}
        >
          ₱••••••
        </Text>
      </Animated.View>
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
    <Animated.View style={animatedStyle}>
      <Text
        variant={variant}
        color={displayColor}
        tabularNums
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={[styles.base, style]}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        {sign}
        {formatted}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    fontVariant: ['tabular-nums'],
  },
});
