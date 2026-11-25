import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { View, StyleSheet, AccessibilityInfo, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react-native';
import { colors, radius, spacing, motion } from '@davao-bank/shared';
import { easing } from '../theme/easing';
import { Text } from './Text';
import { Pressable } from './Pressable';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  show: (message: string, type?: ToastType) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      show: () => {},
      dismiss: () => {},
    };
  }
  return ctx;
}

export interface ToastProps {
  message: string;
  type?: ToastType;
  style?: ViewStyle;
  onDismiss?: () => void;
}

export function Toast({ message, type = 'success', style, onDismiss }: ToastProps) {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={20} color={colors.primary} />;
      case 'error':
        return <AlertCircle size={20} color={colors.redText} />;
      case 'info':
        return <Info size={20} color={colors.blueText} />;
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return colors.primaryTint;
      case 'error':
        return colors.tintRed;
      case 'info':
        return colors.tintBlue;
    }
  };

  return (
    <View
      style={[styles.toast, { backgroundColor: getBackgroundColor() }, style]}
      accessibilityRole="alert"
    >
      {getIcon()}
      <Text variant="bodyStrong" color={colors.ink} style={styles.message}>
        {message}
      </Text>
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss notice"
          onPress={onDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.dismissBtn}
        >
          <X size={16} color={colors.ink} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ToastBannerItem({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(reduceMotion ? 0 : -12);

  const handleFinish = useCallback(() => {
    onDismiss(item.id);
  }, [item.id, onDismiss]);

  const dismissAnim = useCallback(() => {
    'worklet';
    opacity.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(handleFinish)();
    });
    if (!reduceMotion) {
      translateY.value = withTiming(-8, { duration: 150 });
    }
  }, [handleFinish, opacity, reduceMotion, translateY]);

  useEffect(() => {
    // Pattern 12: Fade in and drop 12 pt. Enter timing 250ms.
    opacity.value = withTiming(1, {
      duration: motion.duration.medium,
      easing: easing.enter,
    });
    if (!reduceMotion) {
      translateY.value = withTiming(0, {
        duration: motion.duration.medium,
        easing: easing.enter,
      });
    }

    if (item.type !== 'error') {
      const timer = setTimeout(() => {
        dismissAnim();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [dismissAnim, item.type, opacity, reduceMotion, translateY]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }],
    };
  });

  return (
    <Animated.View style={[styles.bannerWrapper, animatedStyle]}>
      <Toast message={item.message} type={item.type} onDismiss={() => dismissAnim()} />
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const insets = useSafeAreaInsets();

  const dismiss = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const show = useCallback((message: string, type: ToastType = 'success') => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    AccessibilityInfo.announceForAccessibility(message);
    setQueue((prev) => [...prev, { id, message, type }]);
  }, []);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <View
        pointerEvents="box-none"
        style={[styles.queueContainer, { top: Math.max(insets.top, 16) }]}
      >
        {queue.map((item) => (
          <ToastBannerItem key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  queueContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 9999,
    alignItems: 'center',
    gap: spacing.sm,
  },
  bannerWrapper: {
    width: '100%',
    maxWidth: 420,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  message: {
    flex: 1,
  },
  dismissBtn: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
});
