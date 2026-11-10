import { useConfirmSheet } from '../hooks/useConfirmSheet';
import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Platform,
  AccessibilityInfo,
  KeyboardAvoidingView,
  Keyboard,
  type ViewStyle,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation, usePreventRemove } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { colors, spacing, size } from '@davao-bank/shared';
import { Text } from './Text';
import { Pressable } from './Pressable';
import {
  PasswordPromptHost,
  usePasswordPromptHost,
} from '../context/PasswordPromptContext';

export interface FeatureScreenProps {
  title: string;
  step?: number;
  stepCount?: number;
  onBack?: () => void;
  onPrevStep?: () => void;
  isDirty?: boolean;
  isProcessing?: boolean;
  ready?: boolean;
  trailingAction?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  refreshControl?: React.ReactElement;
  /**
   * Receives this screen's back handler so a host `Modal` can route
   * `onRequestClose` (Android back) through the same single guard.
   */
  backHandlerRef?: React.MutableRefObject<(() => void) | null>;
}

const DISCARD_TITLE = 'Discard changes?';
const DISCARD_MESSAGE =
  'You have unsaved details. Are you sure you want to discard them?';

export function FeatureScreen({
  title,
  step,
  stepCount,
  onBack,
  onPrevStep,
  isDirty = false,
  isProcessing = false,
  ready,
  trailingAction,
  children,
  footer,
  style,
  contentContainerStyle,
  refreshControl,
  backHandlerRef,
}: FeatureScreenProps) {
  const { showConfirmation, confirmSheet } = useConfirmSheet();
  const confirmDiscard = (onDiscard: () => void) =>
    showConfirmation({
      title: DISCARD_TITLE,
      message: DISCARD_MESSAGE,
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      destructive: true,
      onConfirm: onDiscard,
    });
  const insets = useSafeAreaInsets();
  let navigation: any;
  try {
    navigation = useNavigation();
  } catch {
    navigation = null;
  }
  let isFocused = true;
  try {
    isFocused = useIsFocused();
  } catch {
    isFocused = true;
  }
  const isHostReady = ready !== undefined ? ready : isFocused;
  const promptHost = usePasswordPromptHost(isHostReady);

  const [scrolled, setScrolled] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(false);

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

  // Two paths, one guard each (never both):
  // - `onBack` passed: the screen is hosted by a Modal (or closes itself).
  //   handleBack owns the discard prompt. usePreventRemove stays OFF, because
  //   inside a Modal useNavigation() returns the *host* tab's navigation.
  // - no `onBack`: the screen is a native-stack page. usePreventRemove owns
  //   the prompt for the back button, Android back and iOS swipe-back.
  const isStackPage = !onBack;

  usePreventRemove(isStackPage && (isDirty || isProcessing), ({ data }) => {
    if (isProcessing) return;
    confirmDiscard(() => navigation?.dispatch(data.action));
  });

  const handleBack = () => {
    Keyboard.dismiss();
    if (isProcessing) return;

    if (step && step > 1 && onPrevStep) {
      onPrevStep();
      return;
    }

    if (onBack) {
      if (isDirty) confirmDiscard(onBack);
      else onBack();
      return;
    }

    navigation?.goBack();
  };

  if (backHandlerRef) backHandlerRef.current = handleBack;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y > 10 && !scrolled) setScrolled(true);
    else if (y <= 10 && scrolled) setScrolled(false);
  };

  const stepLabel =
    step !== undefined && stepCount !== undefined
      ? `Step ${step} of ${stepCount}`
      : undefined;

  return (
    <View style={[styles.root, style]}>
      {/* Header */}
      <View
        style={[
          styles.headerContainer,
          { paddingTop: Math.max(insets.top, spacing.md) },
          scrolled && styles.headerBorder,
        ]}
      >
        {scrolled &&
          (reduceTransparency ? (
            <View style={[StyleSheet.absoluteFill, styles.solidHeaderBackground]} />
          ) : (
            <BlurView
              intensity={Platform.OS === 'ios' ? 70 : 100}
              tint="light"
              style={StyleSheet.absoluteFill}
            />
          ))}

        <ScrollView
          scrollEnabled={false}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={styles.headerBar}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            disabled={isProcessing}
            onPressIn={() => {
              Keyboard.dismiss();
            }}
            onPress={handleBack}
            style={[styles.backButton, isProcessing && { opacity: 0.3 }]}
            hitSlop={spacing.sm}
          >
            <ChevronLeft size={24} color={colors.ink} />
            <Text variant="bodyStrong" color={colors.ink} style={styles.backLabel}>
              Back
            </Text>
          </Pressable>

          <View style={styles.headerTitleBox}>
            {stepLabel ? (
              <Text variant="caption" color={colors.textSecondary} align="center">
                {stepLabel}
              </Text>
            ) : null}
            <Text
              variant="title"
              color={colors.ink}
              align="center"
              accessibilityRole="header"
            >
              {title}
            </Text>
          </View>

          <View style={styles.headerTrailing}>
            {trailingAction || <View style={styles.placeholder} />}
          </View>
        </ScrollView>
      </View>

      {/* Body with keyboard avoidance */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom: footer
                ? FOOTER_CLEARANCE + insets.bottom
                : spacing.xl + insets.bottom,
            },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={16}
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>

        {/* Sticky Footer */}
        {footer ? (
          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, spacing.base) },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {confirmSheet}

      {/* In-Screen Confirmation Prompt Host */}
      <PasswordPromptHost hostId={promptHost.id} ready={isHostReady} />
    </View>
  );
}

// Footer = control height + top and bottom padding.
const FOOTER_CLEARANCE = size.control + spacing.base * 2;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  headerContainer: {
    zIndex: 10,
    backgroundColor: 'transparent',
  },
  solidHeaderBackground: {
    backgroundColor: colors.surface,
  },
  headerBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerBar: {
    minHeight: size.touch + spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenSide,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.touch,
    minWidth: size.touch,
  },
  backLabel: {
    marginLeft: spacing.xs,
  },
  headerTitleBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  headerTrailing: {
    minWidth: size.touch,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  placeholder: {
    width: size.touch,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenSide,
    paddingTop: spacing.base,
    gap: spacing.xl,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.screenSide,
    paddingTop: spacing.base,
    backgroundColor: colors.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
