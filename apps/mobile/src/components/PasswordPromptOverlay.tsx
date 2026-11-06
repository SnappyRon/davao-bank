import React, { useState } from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Lock, Eye, EyeOff, ShieldCheck, X } from 'lucide-react-native';
import { colors, radius, spacing } from '@davao-bank/shared';
import { Text } from './Text';
import { TextField } from './TextField';
import { Button } from './Button';
import { PrivacyOverlay } from './PrivacyOverlay';

export interface PasswordPromptOverlayProps {
  onVisible: () => void;
  title?: string;
  message?: string;
  onConfirm: (password: string) => Promise<boolean>;
  onCancel: () => void;
}

export function PasswordPromptOverlay({
  onVisible,
  title = 'Password Authorization',
  message = 'Please enter your password to authorize this transaction.',
  onConfirm,
  onCancel,
}: PasswordPromptOverlayProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (loading) return;
    setPassword('');
    setError(null);
    onCancel();
  };

  const handleSubmit = async () => {
    if (!password.trim()) {
      setError('Please enter your account password.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const ok = await onConfirm(password);
      if (ok) {
        setPassword('');
        setError(null);
      } else {
        setError('Incorrect password. Please try again.');
      }
    } catch {
      setError('Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View
      style={styles.overlay}
      testID="password-prompt"
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
                  <TouchableOpacity
                    onPress={handleClose}
                    style={styles.closeBtn}
                    accessibilityLabel="Cancel authorization"
                    accessibilityRole="button"
                  >
                    <X size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <Text variant="title" color={colors.ink} style={styles.title}>
                  {title}
                </Text>
                <Text variant="body" color={colors.textSecondary} style={styles.message}>
                  {message}
                </Text>

                <TextField
                  label="Account Password"
                  placeholder="Enter password"
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (error) setError(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={error}
                  leftElement={<Lock size={18} color={colors.textMuted} />}
                  rightElement={
                    <TouchableOpacity
                      onPress={() => setShowPassword((prev) => !prev)}
                      accessibilityLabel={
                        showPassword ? 'Hide password' : 'Show password'
                      }
                      accessibilityRole="button"
                    >
                      {showPassword ? (
                        <EyeOff size={18} color={colors.textMuted} />
                      ) : (
                        <Eye size={18} color={colors.textMuted} />
                      )}
                    </TouchableOpacity>
                  }
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
                    onPress={handleSubmit}
                    loading={loading}
                    disabled={!password.trim() || loading}
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
