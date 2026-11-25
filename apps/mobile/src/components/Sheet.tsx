import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Image,
  Modal,
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Dimensions,
  findNodeHandle,
  type LayoutChangeEvent,
  type Text as RNText,
  type ViewStyle,
  type ImageSourcePropType,
  type ImageStyle,
  TouchableWithoutFeedback,
} from 'react-native';
import Animated, {
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
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
import { BlurView } from 'expo-blur';
import { X } from 'lucide-react-native';
import { colors, elevation, motion, radius, size, spacing } from '@davao-bank/shared';
import { easing } from '../theme/easing';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { PrivacyOverlay } from './PrivacyOverlay';
import {
  PasswordPromptHost,
  usePasswordPromptHost,
} from '../context/PasswordPromptContext';

/** Pattern 5: a swipe closes past 25% of the sheet height or above 1000 pt/s. */
const SWIPE_CLOSE_FRACTION = 0.25;
const SWIPE_CLOSE_VELOCITY = 1000;

/** Spec 7A.3: 36×4 drag handle. */
const HANDLE_WIDTH = 36;
const HANDLE_HEIGHT = 4;
const HANDLE_RADIUS = HANDLE_HEIGHT / 2;
const CLOSE_ICON_SIZE = 20;
/** Smallest sheet, so a one-line confirmation still reads as a sheet. */
const SHEET_MIN_HEIGHT = 180;
/** Close button while the sheet can't be dismissed. */
const DISABLED_OPACITY = 0.3;
/** The sheet sits at the bottom edge, so its card shadow is cast upward. */
const SHEET_SHADOW_OFFSET = { width: 0, height: -elevation.card.shadowOffset.height };

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Decorative header art; the title remains the accessible label. */
  titleImage?: ImageSourcePropType;
  titleImageStyle?: ImageStyle;
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
  titleImage,
  titleImageStyle,
  step,
  stepCount,
  dismissible = true,
  onRequestDismiss,
  children,
  footer,
  style,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  // Reanimated's hook knows the setting before the first frame.
  const reduceMotion = useReducedMotion();
  const promptHost = usePasswordPromptHost(visible);
  const [presented, setPresented] = useState(false);
  // The Modal stays mounted after `visible` turns false until the exit
  // animation ends, so the sheet can slide down and the scrim fade out.
  const [modalVisible, setModalVisible] = useState(visible);
  const [iosKeyboardVisible, setIosKeyboardVisible] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const shownRef = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const titleRef = useRef<React.ComponentRef<typeof RNText>>(null);
  const [swipeRelease, setSwipeRelease] = useState(0);

  useEffect(() => {
    AccessibilityInfo.isReduceTransparencyEnabled().then(setReduceTransparency);
    const sub = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduceTransparency
    );
    return () => {
      sub?.remove();
    };
  }, []);

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
        easing: reduceMotion ? easing.standard : easing.enter,
      });
      scrimProgress.value = withTiming(1, {
        duration: reduceMotion ? motion.duration.short : motion.duration.medium,
        easing: reduceMotion ? easing.standard : easing.enter,
      });
      return;
    }

    setPresented(false);
    // Pattern 5: slide down and fade the scrim, `medium`, exit easing.
    // Reduce Motion: fade, `short`.
    const duration = reduceMotion ? motion.duration.short : motion.duration.medium;
    const curve = reduceMotion ? easing.standard : easing.exit;
    scrimProgress.value = withTiming(0, { duration, easing: curve });
    if (!reduceMotion && drag.value > 0) {
      // After a swipe, fold the finger offset into the exit: drag and progress
      // run on the same curve, so translateY = e·H + (1 − e)·drag₀ moves
      // steadily down from the finger's position to 100%, never back up.
      drag.value = withTiming(0, { duration, easing: curve });
    }
    sheetProgress.value = withTiming(0, { duration, easing: curve }, (finished) => {
      if (finished) runOnJS(finishExit)();
    });
    // Shared values are stable refs, so they are not listed as dependencies.
  }, [visible, reduceMotion, finishExit]);

  // iOS: KeyboardAvoidingView lifts the footer above the keyboard, so the
  // home-indicator inset must not be added while it is up.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', () =>
      setIosKeyboardVisible(true)
    );
    const hide = Keyboard.addListener('keyboardWillHide', () =>
      setIosKeyboardVisible(false)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Spec 7A.3: when the sheet opens or the step changes, focus moves to the title.
  useEffect(() => {
    if (!presented || !titleRef.current) return;
    const node = findNodeHandle(titleRef.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [presented, step]);

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

  const springBack = useCallback(() => {
    drag.value = reduceMotion
      ? withTiming(0, { duration: motion.duration.short, easing: easing.standard })
      : withSpring(0, motion.spring.sheet);
  }, [drag, reduceMotion]);

  // The swipe worklet calls a stable function that always runs the latest guard.
  const handleDismissRef = useRef(handleDismiss);
  handleDismissRef.current = handleDismiss;
  const springBackRef = useRef(springBack);
  springBackRef.current = springBack;
  const dismissFromSwipe = useCallback(() => {
    if (!visibleRef.current) return;
    handleDismissRef.current();
    // Batched with the parent's update from the guard, so the next render sees
    // whether the guard closed the sheet (see the effect below).
    setSwipeRelease((n) => n + 1);
  }, []);
  // After a past-threshold swipe: if the guard closed the sheet, the exit
  // animation continues from the finger; if it declined (pending prompt,
  // onRequestDismiss confirmation), spring back.
  useEffect(() => {
    if (swipeRelease === 0 || !visibleRef.current) return;
    springBackRef.current();
  }, [swipeRelease]);
  const springBackFromSwipe = useCallback(() => springBackRef.current(), []);

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
          // Past the threshold: the same guard as the backdrop, X and Android
          // back decides; the sheet holds at the finger until it does.
          if (pastDistance || pastVelocity) runOnJS(dismissFromSwipe)();
          else runOnJS(springBackFromSwipe)();
        }),
    [dismissible, dismissFromSwipe, springBackFromSwipe, drag, sheetHeight]
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

  // Pattern 7: height changes between steps animate; none under Reduce Motion.
  const heightTransition = useMemo(
    () =>
      reduceMotion
        ? undefined
        : LinearTransition.duration(motion.duration.medium).easing(easing.standard),
    [reduceMotion]
  );

  const handleSheetLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0) sheetHeight.value = height;
  };

  const stepLabel =
    step !== undefined && stepCount !== undefined
      ? `Step ${step} of ${stepCount}`
      : undefined;

  const footerInset = Platform.OS === 'ios' && iosKeyboardVisible ? 0 : insets.bottom;

  return (
    <Modal
      testID="bottom-sheet-modal"
      visible={modalVisible}
      onShow={() => {
        // The Modal can finish presenting after `visible` already went false.
        if (!visibleRef.current) return;
        shownRef.current = true;
        setPresented(true);
      }}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
      accessibilityViewIsModal
    >
      <GestureHandlerRootView style={styles.root}>
        <View
          style={styles.root}
          pointerEvents={visible ? 'auto' : 'none'}
          accessibilityViewIsModal
        >
          <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
            {Platform.OS === 'ios' && !reduceTransparency ? (
              <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            ) : null}
            <TouchableWithoutFeedback onPress={handleDismiss} accessible={false}>
              <View testID="sheet-backdrop" style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
          </Animated.View>

          {/* Outer frame: layout transition for height. Inner: slide/fade transform. */}
          <Animated.View
            style={styles.sheetFrame}
            layout={heightTransition}
            onLayout={handleSheetLayout}
          >
            <Animated.View style={[styles.sheetMotion, sheetStyle]}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={[styles.sheet, style]}
              >
                {/* Drag handle + header: swipe down to dismiss */}
                <GestureDetector gesture={swipe}>
                  <View style={styles.dragArea}>
                    <View style={styles.handleBar} />

                    <View style={styles.header}>
                      <View style={styles.titleBox}>
                        {stepLabel ? (
                          <Text variant="caption" color={colors.textSecondary}>
                            {stepLabel}
                          </Text>
                        ) : null}
                        <View style={styles.titleRow}>
                          {titleImage ? (
                            <Image
                              source={titleImage}
                              style={[styles.titleImage, titleImageStyle]}
                              accessible={false}
                              resizeMode="contain"
                            />
                          ) : null}
                          {title ? (
                            <Text
                              ref={titleRef}
                              variant="title"
                              color={colors.ink}
                              accessibilityRole="header"
                              style={styles.titleText}
                            >
                              {title}
                            </Text>
                          ) : null}
                        </View>
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
                        <X size={CLOSE_ICON_SIZE} color={colors.textSecondary} />
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
                    style={[styles.footer, { paddingBottom: spacing.base + footerInset }]}
                  >
                    {footer}
                  </View>
                ) : null}

                {/* In-Sheet Confirmation Prompt Host */}
                <PasswordPromptHost hostId={promptHost.id} ready={presented} />
              </KeyboardAvoidingView>
            </Animated.View>
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
  sheetMotion: {
    flexShrink: 1,
  },
  sheet: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    minHeight: SHEET_MIN_HEIGHT,
    paddingTop: spacing.md,
    overflow: 'hidden',
    ...elevation.card,
    shadowOffset: SHEET_SHADOW_OFFSET,
  },
  dragArea: {
    paddingBottom: spacing.sm,
  },
  handleBar: {
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    borderRadius: HANDLE_RADIUS,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleImage: {
    width: 32,
    height: 32,
  },
  titleText: {
    flexShrink: 1,
  },
  closeBtn: {
    width: size.touch,
    height: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnDisabled: {
    opacity: DISABLED_OPACITY,
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
