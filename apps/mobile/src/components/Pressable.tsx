import React, { useRef } from 'react';
import {
  Pressable as RNPressable,
  Animated,
  type AccessibilityRole,
  type GestureResponderEvent,
  type Insets,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';

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

export function Pressable({
  accessibilityRole,
  accessibilityLabel,
  onPress,
  onPressIn,
  onPressOut,
  onLongPress,
  disabled = false,
  feedbackType = 'scale',
  hitSlop = DEFAULT_HIT_SLOP,
  style,
  children,
  accessibilityState,
  accessibilityHint,
  testID,
}: PressableProps) {
  const reduceMotion = useReducedMotion();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: GestureResponderEvent) => {
    if (!disabled && feedbackType === 'scale' && !reduceMotion) {
      Animated.timing(scaleAnim, {
        toValue: 0.97,
        duration: 100,
        useNativeDriver: true,
      }).start();
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    if (!disabled && feedbackType === 'scale' && !reduceMotion) {
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
    onPressOut?.(e);
  };

  return (
    <RNPressable
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
      style={(state) => {
        const resolvedStyle = typeof style === 'function' ? style(state) : style;
        return resolvedStyle;
      }}
    >
      {(state) => {
        const resolvedChildren =
          typeof children === 'function' ? children(state) : children;
        if (feedbackType === 'scale' && !reduceMotion) {
          return (
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              {resolvedChildren}
            </Animated.View>
          );
        }
        return resolvedChildren;
      }}
    </RNPressable>
  );
}
