import React, { useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Lock, Eye, EyeOff, ShieldCheck, X } from 'lucide-react-native';
import { colors, radius, spacing } from '@davao-bank/shared';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Text } from './Text';
import { TextField } from './TextField';
import { Button } from './Button';

export interface PasswordConfirmationModalProps {
  visible: boolean;
  title?: string;
  message?: string;
  onConfirm: (password: string) => Promise<boolean>;
  onCancel: () => void;
}

export function PasswordConfirmationModal({
  visible,
  title = 'Password Authorization',
  message = 'Please enter your password to authorize this transaction.',
  onConfirm,
  onCancel,
}: PasswordConfirmationModalProps) {
  const reduceMotion = useReducedMotion();
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.card}
            >
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
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
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
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 26, 26, 0.65)',
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
