import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Platform,
  AccessibilityInfo,
  KeyboardAvoidingView,
  Alert,
  type ViewStyle,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { colors, spacing } from '@davao-bank/shared';
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
}

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
}: FeatureScreenProps) {
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

  const handleBack = () => {
    if (isProcessing) return;

    if (step && step > 1 && onPrevStep) {
      onPrevStep();
      return;
    }

    if (isDirty) {
      Alert.alert(
        'Discard changes?',
        'You have unsaved details. Are you sure you want to discard them?',
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              if (onBack) onBack();
              else navigation.goBack();
            },
          },
        ]
      );
      return;
    }

    if (onBack) onBack();
    else navigation.goBack();
  };

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
          { paddingTop: Math.max(insets.top, 12) },
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

        <View style={styles.headerBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            disabled={isProcessing}
            onPress={handleBack}
            style={[styles.backButton, isProcessing && { opacity: 0.3 }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
        </View>
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
            { paddingBottom: footer ? 100 + insets.bottom : spacing.xl + insets.bottom },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          {children}
        </ScrollView>

        {/* Sticky Footer */}
        {footer ? (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {/* In-Screen Confirmation Prompt Host */}
      <PasswordPromptHost hostId={promptHost.id} ready={isHostReady} />
    </View>
  );
}

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
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  backLabel: {
    marginLeft: 2,
  },
  headerTitleBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  headerTrailing: {
    minWidth: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  placeholder: {
    width: 44,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: spacing.base,
    gap: 24,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: spacing.base,
    backgroundColor: colors.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
