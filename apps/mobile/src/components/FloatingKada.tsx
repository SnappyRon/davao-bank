import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { MessageCircle, ShieldCheck, X } from 'lucide-react-native';
import ReAnimated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { colors, motion, radius, size, spacing } from '@davao-bank/shared';
import { easing } from '../theme/easing';
import { MASCOT_BANTAY } from '../assets/illustrations';
import { useAppBackgrounded } from '../hooks/useAppBackgrounded';
import { fetchSecurityTimeline } from '../hooks/usePhase8Contracts';
import {
  PROTECTIVE_FREEZE_KADA_BODY,
  PROTECTIVE_FREEZE_KADA_SPEC_BODY,
} from '../utils/protectiveFreeze';
import { Button } from './Button';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { FLOATING_TAB_BAR_HEIGHT, floatingTabBarBottomOffset } from './FloatingTabBar';

/** Spec 7c1d935 §4: 64 pt expanded, below the tab bar's zIndex 100. */
export const KADA_SIZE = 64;
export const KADA_COLLAPSED_SIZE = 32;
export const KADA_Z_INDEX = 90;
export const KADA_COLLAPSED_KEY = 'davao_bank_floating_kada_collapsed';

/** Review fix: a horizontal bubble card, capped at 280 pt and the screen gutters. */
export const KADA_BUBBLE_MAX_WIDTH = 280;

export function kadaBubbleWidth(windowWidth: number): number {
  return Math.min(
    KADA_BUBBLE_MAX_WIDTH,
    Math.max(0, windowWidth - spacing.screenSide * 2)
  );
}

/** Left edge of the bubble when it is right-aligned inside the screen gutters. */
export function kadaBubbleLeft(
  windowWidth: number,
  width = kadaBubbleWidth(windowWidth)
): number {
  return windowWidth - spacing.screenSide - width;
}

/** The tab bar is window-anchored; Kada is inside Screen's SafeAreaView. */
export function kadaBottomOffset(safeAreaBottom: number): number {
  return (
    floatingTabBarBottomOffset(safeAreaBottom) +
    FLOATING_TAB_BAR_HEIGHT +
    spacing.base -
    safeAreaBottom
  );
}

const BUBBLE_VISIBLE_MS = 5000;
const DRAG_THRESHOLD = 4;
const LONG_PRESS_MS = 500;
const ACCENT_GAP_MS = 9000;

export interface KadaDragBounds {
  windowWidth: number;
  windowHeight: number;
  insetTop: number;
  insetRight: number;
  insetBottom: number;
  insetLeft: number;
  /** Window-bottom offset of the widget's resting bottom edge. */
  bottomOffset: number;
}

/** Resting top-left origin of the 64 pt widget, before any drag translation. */
export function kadaRestingOrigin(bounds: KadaDragBounds): { x: number; y: number } {
  return {
    x: bounds.windowWidth - spacing.screenSide - KADA_SIZE,
    y: bounds.windowHeight - bounds.bottomOffset - KADA_SIZE,
  };
}

/**
 * Clamps a drag translation so the whole widget stays inside the safe area and
 * above the floating tab bar. Exported for deterministic unit tests.
 */
export function clampKadaPosition(
  position: { x: number; y: number },
  bounds: KadaDragBounds
): { x: number; y: number } {
  const rest = kadaRestingOrigin(bounds);
  const minLeft = Math.max(bounds.insetLeft + spacing.sm, spacing.sm);
  const maxLeft = Math.max(
    minLeft,
    bounds.windowWidth - bounds.insetRight - spacing.screenSide - KADA_SIZE
  );
  const minTop = bounds.insetTop + spacing.base;
  const maxTop = Math.max(minTop, bounds.windowHeight - bounds.bottomOffset - KADA_SIZE);

  return {
    x: Math.min(Math.max(position.x, minLeft - rest.x), maxLeft - rest.x),
    y: Math.min(Math.max(position.y, minTop - rest.y), maxTop - rest.y),
  };
}

export interface FloatingKadaProps {
  locked?: boolean;
  /** The Bantay protective freeze has its own mandated bubble copy. */
  protective?: boolean;
  onOpenBantay: () => void;
  /** Stage 8O: the bubble's button, never a tap or long-press gesture. */
  onOpenChat: () => void;
}

function isToday(isoDate: string): boolean {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return false;
  return date.toDateString() === new Date().toDateString();
}

export function FloatingKada({
  locked = false,
  protective = false,
  onOpenBantay,
  onOpenChat,
}: FloatingKadaProps) {
  const insets = useSafeAreaInsets();
  const windowSize = useWindowDimensions();
  const focused = useIsFocused();
  const backgrounded = useAppBackgrounded();
  const reduceMotion = useReducedMotion();
  const shouldAnimate = !reduceMotion && !backgrounded && focused;

  const [collapsed, setCollapsed] = useState(false);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [bubbleCopy, setBubbleCopy] = useState('');
  const announcedOnce = useRef(false);

  // Subtract the inset because Screen's SafeAreaView already applies it; the
  // tab bar's offset is window-relative. Otherwise the Kada floats 34 pt too
  // high on iPhones and lands on the More services card.
  const bottomOffset = kadaBottomOffset(insets.bottom);
  const bubbleWidth = kadaBubbleWidth(windowSize.width);
  const bounds = useMemo<KadaDragBounds>(
    () => ({
      windowWidth: windowSize.width,
      windowHeight: windowSize.height,
      insetTop: insets.top,
      insetRight: insets.right,
      insetBottom: insets.bottom,
      insetLeft: insets.left,
      bottomOffset,
    }),
    [
      windowSize.width,
      windowSize.height,
      insets.top,
      insets.right,
      insets.bottom,
      insets.left,
      bottomOffset,
    ]
  );

  // Reanimated drives the idle loop; plain Animated drives the drag offset, so
  // a drag never fights the float/tilt/flap animation on the inner mascot.
  const translate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const positionRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const idX = translate.x.addListener(({ value }) => {
      positionRef.current.x = value;
    });
    const idY = translate.y.addListener(({ value }) => {
      positionRef.current.y = value;
    });
    return () => {
      translate.x.removeListener(idX);
      translate.y.removeListener(idY);
    };
  }, [translate]);

  const clamp = useCallback(
    (position: { x: number; y: number }) => clampKadaPosition(position, bounds),
    [bounds]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) >= DRAG_THRESHOLD ||
          Math.abs(gesture.dy) >= DRAG_THRESHOLD,
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          Math.abs(gesture.dx) >= DRAG_THRESHOLD ||
          Math.abs(gesture.dy) >= DRAG_THRESHOLD,
        onPanResponderGrant: () => {
          positionRef.current = {
            x: Number((translate.x as unknown as { __getValue(): number }).__getValue()),
            y: Number((translate.y as unknown as { __getValue(): number }).__getValue()),
          };
        },
        onPanResponderMove: (_, gesture) => {
          const start = positionRef.current;
          translate.setValue(clamp({ x: start.x + gesture.dx, y: start.y + gesture.dy }));
        },
      }),
    [clamp, translate]
  );

  const floatY = useSharedValue(0);
  const tilt = useSharedValue(0);
  const flap = useSharedValue(1);
  const entrance = useSharedValue(reduceMotion ? 0 : 4);
  const bubbleOpacity = useSharedValue(0);
  const tapScale = useSharedValue(1);

  useEffect(() => {
    if (!shouldAnimate) {
      cancelAnimation(floatY);
      cancelAnimation(tilt);
      cancelAnimation(flap);
      floatY.value = 0;
      tilt.value = 0;
      flap.value = 1;
      entrance.value = 0;
      return;
    }

    floatY.value = withRepeat(
      withTiming(-3, {
        duration: motion.duration.expressive * 6,
        easing: easing.standard,
      }),
      -1,
      true
    );
    // Tilt and flap alternate roughly every 9 s; the float keeps running.
    const accentDuration = motion.duration.long;
    tilt.value = withRepeat(
      withSequence(
        withDelay(
          ACCENT_GAP_MS,
          withTiming(-2, { duration: accentDuration, easing: easing.standard })
        ),
        withTiming(0, { duration: accentDuration, easing: easing.standard }),
        withDelay(ACCENT_GAP_MS, withTiming(0, { duration: accentDuration })),
        withTiming(0, { duration: accentDuration })
      ),
      -1
    );
    flap.value = withRepeat(
      withSequence(
        withDelay(
          ACCENT_GAP_MS,
          withTiming(1.03, { duration: motion.duration.short, easing: easing.enter })
        ),
        withTiming(1, { duration: motion.duration.medium, easing: easing.enter }),
        withDelay(ACCENT_GAP_MS, withTiming(1, { duration: motion.duration.short })),
        withTiming(1, { duration: motion.duration.medium })
      ),
      -1
    );
    entrance.value = withTiming(0, {
      duration: motion.duration.medium,
      easing: easing.enter,
    });

    return () => {
      cancelAnimation(floatY);
      cancelAnimation(tilt);
      cancelAnimation(flap);
    };
  }, [shouldAnimate, floatY, tilt, flap, entrance]);

  const mascotStyle = useAnimatedStyle(() => ({
    opacity: 1,
    transform: [
      { translateY: floatY.value + entrance.value },
      { rotate: `${tilt.value}deg` },
      { scale: flap.value * tapScale.value },
    ],
  }));

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: bubbleOpacity.value,
    transform: [{ translateY: reduceMotion ? 0 : (1 - bubbleOpacity.value) * 4 }],
  }));

  useEffect(() => {
    let active = true;
    try {
      void SecureStore.getItemAsync(KADA_COLLAPSED_KEY)
        .then((stored) => {
          if (active && stored === '1') setCollapsed(true);
        })
        .catch(() => undefined);
    } catch {
      // SecureStore is unavailable in some test environments.
    }
    return () => {
      active = false;
    };
  }, []);

  const setCollapsedState = useCallback((value: boolean) => {
    setCollapsed(value);
    try {
      void SecureStore.setItemAsync(KADA_COLLAPSED_KEY, value ? '1' : '0').catch(
        () => undefined
      );
    } catch {
      // Device storage is best-effort; the in-memory state still works.
    }
  }, []);

  const hideBubble = useCallback(() => {
    if (reduceMotion) {
      setBubbleVisible(false);
      bubbleOpacity.value = 0;
      return;
    }
    bubbleOpacity.value = withTiming(
      0,
      { duration: motion.duration.medium, easing: easing.exit },
      () => {
        runOnJS(setBubbleVisible)(false);
      }
    );
  }, [reduceMotion, bubbleOpacity]);

  useEffect(() => {
    if (!bubbleVisible) return;
    bubbleOpacity.value = withTiming(1, {
      duration: motion.duration.short,
      easing: easing.enter,
    });
    const timer = setTimeout(hideBubble, BUBBLE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [bubbleVisible, hideBubble, bubbleOpacity]);

  const showBubble = useCallback((message: string) => {
    setBubbleCopy(message);
    setBubbleVisible(true);
    // Announce only the first bubble of the visit; later tips stay visible-only.
    if (!announcedOnce.current) {
      announcedOnce.current = true;
      if (typeof AccessibilityInfo.announceForAccessibility === 'function') {
        AccessibilityInfo.announceForAccessibility(message);
      }
    }
  }, []);

  const handleTap = useCallback(async () => {
    if (protective) {
      if (!reduceMotion) {
        tapScale.value = withSequence(
          withSpring(1.06, motion.spring.pop),
          withSpring(1, motion.spring.pop)
        );
      }
      showBubble(PROTECTIVE_FREEZE_KADA_BODY);
      return;
    }

    if (!reduceMotion) {
      tapScale.value = withSequence(
        withSpring(1.06, motion.spring.pop),
        withSpring(1, motion.spring.pop)
      );
    }

    // Real data only: omit the count rather than showing 0 when the RPC fails.
    let count: number | null = null;
    try {
      const { data, error } = await fetchSecurityTimeline(50);
      if (!error) {
        count = data.filter((event) => isToday(event.created_at)).length;
      }
    } catch {
      count = null;
    }
    const suffix = count === null ? '' : ` · ${count} alerts today`;
    showBubble(
      locked ? `Your account is locked${suffix}` : `Watching your account${suffix}`
    );
  }, [locked, protective, reduceMotion, showBubble, tapScale]);

  const handleLongPress = useCallback(() => {
    try {
      void impactAsync(ImpactFeedbackStyle.Light);
    } catch {
      // Haptics are optional; navigation still happens.
    }
    onOpenBantay();
  }, [onOpenBantay]);

  return (
    <View
      style={[
        styles.anchor,
        {
          bottom: bottomOffset,
          right: spacing.screenSide,
          zIndex: KADA_Z_INDEX,
        },
      ]}
      testID="floating-kada-anchor"
    >
      {bubbleVisible ? (
        <ReAnimated.View
          style={[
            styles.bubble,
            {
              width: bubbleWidth,
              bottom: KADA_SIZE + spacing.sm,
              right: 0,
            },
            bubbleStyle,
          ]}
          testID="floating-kada-bubble"
          accessibilityLiveRegion="polite"
        >
          <Text
            variant="body"
            color={colors.ink}
            style={styles.bubbleText}
            numberOfLines={protective ? 6 : 3}
            maxFontSizeMultiplier={1.4}
          >
            {bubbleCopy}
            {protective ? `\n${PROTECTIVE_FREEZE_KADA_SPEC_BODY}` : ''}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            feedbackType="highlight"
            hitSlop={12}
            onPress={hideBubble}
            style={styles.dismiss}
            testID="floating-kada-dismiss"
          >
            <X size={20} color={colors.textSecondary} />
          </Pressable>
          <Button
            title="Open Bantay"
            accessibilityLabel="Open Bantay"
            icon={
              <View testID="floating-kada-action-icon">
                <ShieldCheck size={18} color={colors.textInverse} />
              </View>
            }
            onPress={() => {
              hideBubble();
              onOpenBantay();
            }}
            style={styles.bubbleAction}
          />
          <Button
            title="Ask Bantay"
            accessibilityLabel="Ask Bantay"
            variant="secondary"
            icon={<MessageCircle size={18} color={colors.primary} />}
            onPress={() => {
              hideBubble();
              onOpenChat();
            }}
            style={styles.bubbleAction}
          />
        </ReAnimated.View>
      ) : null}

      {collapsed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show Bantay"
          feedbackType="highlight"
          hitSlop={8}
          onPress={() => setCollapsedState(false)}
          style={styles.collapsedBadge}
          testID="floating-kada-show"
        >
          <ShieldCheck size={18} color={colors.primary} />
        </Pressable>
      ) : (
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.widget,
            { transform: [{ translateX: translate.x }, { translateY: translate.y }] },
          ]}
          testID="floating-kada-drag-surface"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              protective
                ? 'Bantay, account frozen'
                : locked
                  ? 'Bantay, account locked'
                  : 'Bantay, watching your account'
            }
            feedbackType="none"
            onPress={() => void handleTap()}
            onLongPress={handleLongPress}
            delayLongPress={LONG_PRESS_MS}
            style={styles.widgetPressable}
            testID="floating-kada"
          >
            <ReAnimated.View style={[styles.mascot, mascotStyle]}>
              <Image
                source={MASCOT_BANTAY}
                style={styles.mascotImage}
                accessible={false}
              />
            </ReAnimated.View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hide Bantay"
            feedbackType="highlight"
            hitSlop={12}
            onPress={() => {
              hideBubble();
              setCollapsedState(true);
            }}
            style={styles.hide}
            testID="floating-kada-hide"
          >
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    alignItems: 'flex-end',
    elevation: 6,
  },
  widget: {
    width: KADA_SIZE,
    height: KADA_SIZE,
    borderRadius: radius.pill,
  },
  widgetPressable: {
    width: KADA_SIZE,
    height: KADA_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: size.touch,
  },
  mascot: {
    width: KADA_SIZE,
    height: KADA_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotImage: {
    width: KADA_SIZE,
    height: KADA_SIZE,
    resizeMode: 'contain',
  },
  hide: {
    position: 'absolute',
    // Keep the dismiss control inside the 64 pt frame so it never overlaps a
    // neighbouring tappable card.
    top: 0,
    right: 0,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  collapsedBadge: {
    width: KADA_COLLAPSED_SIZE,
    height: KADA_COLLAPSED_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    position: 'absolute',
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    gap: spacing.sm,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  bubbleText: {
    flexShrink: 1,
  },
  bubbleAction: {
    minHeight: size.touch,
  },
  dismiss: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
