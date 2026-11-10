import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  type LayoutChangeEvent,
  type ViewStyle,
  TouchableWithoutFeedback,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { colors, motion, radius, spacing } from '@davao-bank/shared';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { PrivacyOverlay } from './PrivacyOverlay';
import {
  PasswordPromptHost,
  usePasswordPromptHost,
} from '../context/PasswordPromptContext';

// Motion tokens (Phase 7 motion table). Easing curves mirror `motion.easing`.
const EASE_STANDARD = Easing.bezier(0.2, 0, 0, 1);
const EASE_ENTER = Easing.bezier(0, 0, 0, 1);
const EASE_EXIT = Easing.bezier(0.3, 0, 1, 1);

/** Pattern 5: a swipe closes past 25% of the sheet height or above 1000 pt/s. */
const SWIPE_CLOSE_FRACTION = 0.25;
const SWIPE_CLOSE_VELOCITY = 1000;

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  step?: number;
  stepCount?: number;
  dismissible?: boolean;
  onRequestDismiss?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  style?: ViewStyle;
}

export function Sheet({
  visible,
  onClose,
  title,
  step,
  stepCount,
  dismissible = true,
  onRequestDismiss,
  children,
  footer,
  style,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const promptHost = usePasswordPromptHost(visible);
  const [presented, setPresented] = useState(false);
  // The Modal stays mounted after `visible` turns false until the exit
  // animation ends, so the sheet can slide down and the scrim fade out.
  const [modalVisible, setModalVisible] = useState(visible);
  const shownRef = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // 0 = closed, 1 = open. The scrim and the sheet run on separate timings.
  const scrimProgress = useSharedValue(0);
  const sheetProgress = useSharedValue(0);
  const drag = useSharedValue(0);
  const sheetHeight = useSharedValue(Dimensions.get('window').height);

  const finishExit = useCallback(() => {
    // A reopen during the exit cancels the animation; double-check anyway.
    if (visibleRef.current) return;
    shownRef.current = false;
    setModalVisible(false);
  }, []);

  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      // Reopened during the exit: the native Modal never hid, so onShow
      // won't fire again. Mark the sheet presented for the prompt host.
      if (shownRef.current) setPresented(true);
      drag.value = 0;
      // Pattern 4: sheet `long`, scrim `medium`, enter easing. Reduce Motion:
      // fade only, `short`, no movement.
      sheetProgress.value = withTiming(1, {
        duration: reduceMotion ? motion.duration.short : motion.duration.long,
        easing: reduceMotion ? EASE_STANDARD : EASE_ENTER,
      });
      scrimProgress.value = withTiming(1, {
        duration: reduceMotion ? motion.duration.short : motion.duration.medium,
        easing: reduceMotion ? EASE_STANDARD : EASE_ENTER,
      });
      return;
    }

    setPresented(false);
    // Pattern 5: slide down and fade the scrim, `medium`, exit easing.
    // Reduce Motion: fade, `short`.
    const duration = reduceMotion ? motion.duration.short : motion.duration.medium;
    const easing = reduceMotion ? EASE_STANDARD : EASE_EXIT;
    scrimProgress.value = withTiming(0, { duration, easing });
    sheetProgress.value = withTiming(0, { duration, easing }, (finished) => {
      if (finished) runOnJS(finishExit)();
    });
  }, [visible, reduceMotion, finishExit, drag, scrimProgress, sheetProgress]);

  const handleDismiss = () => {
    if (promptHost.hasPrompt) {
      promptHost.cancel?.();
      return;
    }
    if (!dismissible) return;

    if (onRequestDismiss) {
      onRequestDismiss();
    } else {
      onClose();
    }
  };

  // The swipe worklet calls a stable function that always runs the latest guard.
  const handleDismissRef = useRef(handleDismiss);
  handleDismissRef.current = handleDismiss;
  const dismissFromSwipe = useCallback(() => {
    if (!visibleRef.current) return;
    handleDismissRef.current();
  }, []);

  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .withTestId('sheet-swipe')
        .enabled(dismissible)
        // Activate only on a downward drag, so taps (Close) and sideways
        // movement are left alone.
        .activeOffsetY(8)
        .failOffsetX([-24, 24])
        .onUpdate((event) => {
          // Follows the finger; no upward overdrag beyond 0.
          drag.value = Math.max(0, event.translationY);
        })
        .onEnd((event) => {
          const pastDistance =
            event.translationY > sheetHeight.value * SWIPE_CLOSE_FRACTION;
          const pastVelocity = event.velocityY > SWIPE_CLOSE_VELOCITY;
          if (pastDistance || pastVelocity) {
            // Goes through the same guard as the backdrop, X and Android back.
            // If the guard closes the sheet, the exit animation takes over from
            // here; if it doesn't (pending prompt, onRequestDismiss), the sheet
            // settles back.
            runOnJS(dismissFromSwipe)();
          }
          drag.value = reduceMotion
            ? withTiming(0, { duration: motion.duration.short, easing: EASE_STANDARD })
            : withSpring(0, motion.spring.sheet);
        }),
    [dismissible, reduceMotion, dismissFromSwipe, drag, sheetHeight]
  );

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: scrimProgress.value,
  }));

  const sheetStyle = useAnimatedStyle(() => {
    if (reduceMotion) {
      return {
        opacity: sheetProgress.value,
        transform: [{ translateY: drag.value }],
      };
    }
    return {
      opacity: 1,
      transform: [
        { translateY: (1 - sheetProgress.value) * sheetHeight.value + drag.value },
      ],
    };
  }, [reduceMotion]);

  const handleSheetLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0) sheetHeight.value = height;
  };

  const stepLabel =
    step !== undefined && stepCount !== undefined
      ? `Step ${step} of ${stepCount}`
      : undefined;

  return (
    <Modal
      testID="bottom-sheet-modal"
      visible={modalVisible}
      onShow={() => {
        shownRef.current = true;
        setPresented(true);
      }}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
      accessibilityViewIsModal
    >
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.root} pointerEvents={visible ? 'auto' : 'none'}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
            <TouchableWithoutFeedback onPress={handleDismiss} accessible={false}>
              <View testID="sheet-backdrop" style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
          </Animated.View>

          <Animated.View
            style={[styles.sheetFrame, sheetStyle]}
            onLayout={handleSheetLayout}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={[styles.sheet, style]}
            >
              {/* Drag handle + header: swipe down to dismiss */}
              <GestureDetector gesture={swipe}>
                <View style={styles.dragArea}>
                  {/* 36x4 Drag Handle */}
                  <View style={styles.handleBar} />

                  {/* Header */}
                  <View style={styles.header}>
                    <View style={styles.titleBox}>
                      {stepLabel ? (
                        <Text variant="caption" color={colors.textSecondary}>
                          {stepLabel}
                        </Text>
                      ) : null}
                      {title ? (
                        <Text
                          variant="title"
                          color={colors.ink}
                          accessibilityRole="header"
                        >
                          {title}
                        </Text>
                      ) : null}
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                      onPress={handleDismiss}
                      disabled={!dismissible}
                      style={[styles.closeBtn, !dismissible && styles.closeBtnDisabled]}
                      hitSlop={{
                        top: spacing.sm,
                        bottom: spacing.sm,
                        left: spacing.sm,
                        right: spacing.sm,
                      }}
                    >
                      <X size={20} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                </View>
              </GestureDetector>

              {/* Body */}
              <ScrollView
                style={styles.body}
                contentContainerStyle={[
                  styles.contentContainer,
                  {
                    paddingBottom: footer ? spacing.base : spacing.xl + insets.bottom,
                  },
                ]}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>

              {/* Sticky Footer: 16 + bottom safe-area inset */}
              {footer ? (
                <View
                  style={[styles.footer, { paddingBottom: spacing.base + insets.bottom }]}
                >
                  {footer}
                </View>
              ) : null}

              {/* In-Sheet Confirmation Prompt Host */}
              <PasswordPromptHost hostId={promptHost.id} ready={presented} />
            </KeyboardAvoidingView>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
      <PrivacyOverlay />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    backgroundColor: colors.scrim,
  },
  sheetFrame: {
    maxHeight: '90%',
  },
  sheet: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    minHeight: 180,
    paddingTop: spacing.md,
    overflow: 'hidden',
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  dragArea: {
    paddingBottom: spacing.sm,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenSide,
  },
  titleBox: {
    flex: 1,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnDisabled: {
    opacity: 0.3,
  },
  body: {
    flexGrow: 0,
  },
  contentContainer: {
    paddingHorizontal: spacing.screenSide,
    paddingTop: spacing.xs,
  },
  footer: {
    paddingHorizontal: spacing.screenSide,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
