import React from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  type ViewStyle,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X } from 'lucide-react-native';
import { colors, radius, spacing } from '@davao-bank/shared';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Text } from './Text';
import { PrivacyOverlay } from './PrivacyOverlay';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  dismissible?: boolean;
  onRequestDismiss?: () => void;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  style,
  dismissible = true,
  onRequestDismiss,
}: BottomSheetProps) {
  const reduceMotion = useReducedMotion();

  const handleDismiss = () => {
    if (dismissible === false) {
      return;
    }
    if (onRequestDismiss) {
      onRequestDismiss();
    } else {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={handleDismiss}
    >
      <TouchableWithoutFeedback onPress={handleDismiss}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={[styles.sheet, style]}
            >
              <View style={styles.handleBar} />

              <View style={styles.header}>
                {title ? (
                  <Text variant="h2" color={colors.ink}>
                    {title}
                  </Text>
                ) : (
                  <View />
                )}
                <TouchableOpacity
                  activeOpacity={dismissible ? 0.7 : 1}
                  onPress={handleDismiss}
                  accessibilityRole="button"
                  accessibilityLabel="Close sheet"
                  style={[styles.closeBtn, !dismissible && { opacity: 0.3 }]}
                  disabled={!dismissible}
                >
                  <X size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.body}>{children}</View>
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
    backgroundColor: 'rgba(26, 26, 26, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['3xl'],
    maxHeight: '90%',
  },
  handleBar: {
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.base,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    width: '100%',
  },
});
