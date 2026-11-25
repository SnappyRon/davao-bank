import React, { useRef, useState } from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ShieldCheck, X } from 'lucide-react-native';
import { colors, radius, spacing } from '@davao-bank/shared';
import { Text } from './Text';
import { TextField } from './TextField';
import { Button } from './Button';
import { PrivacyOverlay } from './PrivacyOverlay';
import { Pressable } from './Pressable';

export interface TotpPromptOverlayProps {
  onVisible: () => void;
  title?: string;
  message?: string;
  onConfirm: (code: string) => Promise<boolean>;
  onCancel: () => void;
}

export function TotpPromptOverlay({
  onVisible,
  title = 'Enter your authenticator code',
  message = 'Enter the 6-digit code shown in your authenticator app to authorize this transaction.',
  onConfirm,
  onCancel,
}: TotpPromptOverlayProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const handleClose = () => {
    if (loading) return;
    setCode('');
    setError(null);
    onCancel();
  };

  const handleSubmit = async (valueToVerify?: string) => {
    const val = valueToVerify || code;
    if (inFlight.current || !/^\d{6}$/.test(val)) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const ok = await onConfirm(val);
      if (ok) {
        setCode('');
        setError(null);
      } else {
        setError('Code not accepted. Try the latest code from your authenticator app.');
      }
    } catch {
      setError('Could not verify the code. Please try again.');
    } finally {
      setCode('');
      setLoading(false);
      inFlight.current = false;
    }
  };

  return (
    <View
      style={styles.overlay}
      testID="totp-prompt"
      onLayout={({ nativeEvent }) => {
        if (nativeEvent.layout.width > 0 && nativeEvent.layout.height > 0) onVisible();
      }}
      accessibilityViewIsModal
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <TouchableWithoutFeedback>
              <View style={styles.card}>
                <View style={styles.headerRow}>
                  <View style={styles.iconCircle}>
                    <ShieldCheck size={22} color={colors.primary} />
                  </View>
                  <Pressable
                    onPress={handleClose}
                    style={styles.closeBtn}
                    accessibilityLabel="Cancel authorization"
                    accessibilityRole="button"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={20} color={colors.textMuted} />
                  </Pressable>
                </View>

                <Text variant="title" color={colors.ink} style={styles.title}>
                  {title}
                </Text>
                <Text variant="body" color={colors.textSecondary} style={styles.message}>
                  {message}
                </Text>

                <TextField
                  label="Authenticator code"
                  accessibilityLabel="Authenticator code"
                  placeholder="000000"
                  value={code}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                  editable={!loading}
                  error={error}
                  onChangeText={(text) => {
                    const val = text.replace(/\D/g, '').slice(0, 6);
                    setCode(val);
                    if (error) setError(null);
                    if (val.length === 6) {
                      void handleSubmit(val);
                    }
                  }}
                  containerStyle={styles.inputContainer}
                />

                <View style={styles.btnRow}>
                  <Button
                    title="Cancel"
                    variant="ghost"
                    onPress={handleClose}
                    disabled={loading}
                    style={styles.cancelBtn}
                  />
                  <Button
                    title="Authorize"
                    variant="primary"
                    onPress={() => void handleSubmit()}
                    loading={loading}
                    disabled={code.length !== 6 || loading}
                    style={styles.submitBtn}
                  />
                </View>
              </View>
            </TouchableWithoutFeedback>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
      <PrivacyOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 10000, elevation: 10000 },
  backdrop: { flex: 1, backgroundColor: 'rgba(26, 26, 26, 0.65)' },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    padding: spacing.xs,
  },
  title: {
    marginBottom: spacing.xs,
  },
  message: {
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  cancelBtn: {
    flex: 1,
  },
  submitBtn: {
    flex: 1,
  },
});
