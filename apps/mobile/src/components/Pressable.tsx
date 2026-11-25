import React, { useRef, useState } from 'react';
import {
  Pressable as RNPressable,
  Animated,
  type AccessibilityRole,
  type GestureResponderEvent,
  type Insets,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { motion } from '@davao-bank/shared';

export type PressFeedbackType = 'scale' | 'highlight' | 'none';

export interface PressableProps {
  accessibilityRole: AccessibilityRole;
  accessibilityLabel: string;
  onPress?: (event: GestureResponderEvent) => void;
  onPressIn?: (event: GestureResponderEvent) => void;
  onPressOut?: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  feedbackType?: PressFeedbackType;
  /** Scale while pressed for `feedbackType='scale'`. Default 0.97 (Button uses 0.98). */
  pressedScale?: number;
  hitSlop?: Insets | number;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
  accessibilityState?: {
    disabled?: boolean;
    selected?: boolean;
    checked?: boolean | 'mixed';
    busy?: boolean;
    expanded?: boolean;
  };
  accessibilityHint?: string;
  testID?: string;
}

const DEFAULT_HIT_SLOP: Insets = { top: 8, bottom: 8, left: 8, right: 8 };
const HIGHLIGHT_OPACITY = 0.6;

// The animated node IS the pressable surface, so the caller's style (row
// layout, background, border) is applied to the element that scales.
const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

export function Pressable({
  accessibilityRole,
  accessibilityLabel,
  onPress,
  onPressIn,
  onPressOut,
  onLongPress,
  disabled = false,
  feedbackType = 'scale',
  pressedScale = 0.97,
  hitSlop = DEFAULT_HIT_SLOP,
  style,
  children,
  accessibilityState,
  accessibilityHint,
  testID,
}: PressableProps) {
  const reduceMotion = useReducedMotion();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const animateScale = feedbackType === 'scale' && !reduceMotion;

  const handlePressIn = (e: GestureResponderEvent) => {
    setPressed(true);
    if (!disabled && animateScale) {
      Animated.timing(scaleAnim, {
        toValue: pressedScale,
        duration: motion.duration.micro,
        useNativeDriver: true,
      }).start();
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    setPressed(false);
    if (!disabled && animateScale) {
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: motion.duration.short,
        useNativeDriver: true,
      }).start();
    }
    onPressOut?.(e);
  };

  const resolvedStyle = typeof style === 'function' ? style({ pressed }) : style;
  const highlight =
    feedbackType === 'highlight' && pressed && !disabled
      ? { opacity: HIGHLIGHT_OPACITY }
      : null;

  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled), ...accessibilityState }}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLongPress={onLongPress}
      testID={testID}
      style={[
        resolvedStyle,
        highlight,
        animateScale ? { transform: [{ scale: scaleAnim }] } : null,
      ]}
    >
      {typeof children === 'function' ? children({ pressed }) : children}
    </AnimatedPressable>
  );
}
