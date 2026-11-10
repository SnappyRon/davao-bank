import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  type ViewStyle,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { colors, radius, spacing } from '@davao-bank/shared';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { PrivacyOverlay } from './PrivacyOverlay';
import {
  PasswordPromptHost,
  usePasswordPromptHost,
} from '../context/PasswordPromptContext';

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

  useEffect(() => {
    if (!visible) setPresented(false);
  }, [visible]);

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

  const stepLabel =
    step !== undefined && stepCount !== undefined
      ? `Step ${step} of ${stepCount}`
      : undefined;

  return (
    <Modal
      testID="bottom-sheet-modal"
      visible={visible}
      onShow={() => setPresented(true)}
      transparent
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={handleDismiss}
      accessibilityViewIsModal
    >
      <TouchableWithoutFeedback onPress={handleDismiss} accessible={false}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback accessible={false}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={[styles.sheet, style]}
            >
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
                    <Text variant="title" color={colors.ink} accessibilityRole="header">
                      {title}
                    </Text>
                  ) : null}
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={handleDismiss}
                  disabled={!dismissible}
                  style={[styles.closeBtn, !dismissible && { opacity: 0.3 }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={20} color={colors.textSecondary} />
                </Pressable>
              </View>

              {/* Body */}
              <ScrollView
                style={styles.body}
                contentContainerStyle={[
                  styles.contentContainer,
                  {
                    paddingBottom: footer
                      ? 80 + insets.bottom
                      : spacing.xl + insets.bottom,
                  },
                ]}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>

              {/* Sticky Footer */}
              {footer ? (
                <View
                  style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}
                >
                  {footer}
                </View>
              ) : null}

              {/* In-Sheet Confirmation Prompt Host */}
              <PasswordPromptHost hostId={promptHost.id} ready={presented} />
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
      <PrivacyOverlay />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '90%',
    minHeight: 180,
    paddingTop: spacing.md,
    overflow: 'hidden',
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
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
    paddingHorizontal: 20,
    marginBottom: spacing.sm,
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
  body: {
    flexGrow: 0,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: spacing.xs,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
