import React from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { colors, spacing } from '@davao-bank/shared';
import { AuthenticatorCode } from './AuthenticatorCode';
import { Text } from './Text';
import { PrivacyOverlay } from './PrivacyOverlay';

export function TotpPromptOverlay({
  onVisible,
  onConfirm,
  onCancel,
}: {
  onVisible: () => void;
  onConfirm: (code: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  return (
    <View
      testID="totp-prompt"
      accessibilityViewIsModal
      style={{
        ...StyleSheet.absoluteFill,
        zIndex: 10000,
        elevation: 10000,
        backgroundColor: 'rgba(0,0,0,0.65)',
      }}
      onLayout={({ nativeEvent }) => {
        if (nativeEvent.layout.width > 0 && nativeEvent.layout.height > 0) onVisible();
      }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            padding: spacing.xl,
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              padding: spacing.xl,
              borderRadius: 20,
            }}
          >
            <Text variant="title">Two-step verification</Text>
            <Text>Enter the 6-digit code from your authenticator app to continue.</Text>
            <AuthenticatorCode verify={onConfirm} onCancel={onCancel} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <PrivacyOverlay />
    </View>
  );
}
