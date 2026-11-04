import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { KeyRound, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { colors, spacing, radius, toUserMessage } from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { Screen, Text, TextField, Button, Card, Logo } from '../components';

interface ForgotPasswordScreenProps {
  onNavigateToLogin: () => void;
}

export function ForgotPasswordScreen({ onNavigateToLogin }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleReset = async () => {
    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) {
        setErrorMessage(toUserMessage(error));
      } else {
        setMessage('Password reset instructions have been sent to your email address.');
      }
    } catch (err: unknown) {
      setErrorMessage(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            <Logo variant="horizontal" size={44} />
          </View>

          <View style={styles.headingBox}>
            <Text variant="h1" style={styles.title}>
              Reset password
            </Text>
            <Text variant="body" color={colors.textSecondary}>
              Enter your registered email and we'll send you instructions to reset your
              password.
            </Text>
          </View>

          {errorMessage ? (
            <Card variant="subtle" style={styles.errorCard}>
              <AlertCircle size={18} color={colors.redText} />
              <Text variant="caption" color={colors.redText} style={styles.feedbackText}>
                {errorMessage}
              </Text>
            </Card>
          ) : null}

          {message ? (
            <Card variant="subtle" style={styles.successCard}>
              <CheckCircle2 size={18} color={colors.primary} />
              <Text variant="caption" color={colors.primary} style={styles.feedbackText}>
                {message}
              </Text>
            </Card>
          ) : null}

          <View style={styles.form}>
            <TextField
              label="Email Address"
              value={email}
              onChangeText={setEmail}
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Button
              title="Send Reset Instructions"
              onPress={handleReset}
              loading={loading}
              icon={<KeyRound size={18} color={colors.textInverse} />}
              style={styles.submitBtn}
            />

            <Button
              title="Back to Sign In"
              variant="ghost"
              icon={<ArrowLeft size={18} color={colors.primary} />}
              onPress={onNavigateToLogin}
              style={styles.backBtn}
            />
          </View>

          <Text
            variant="caption"
            color={colors.textMuted}
            align="center"
            style={styles.disclaimerText}
          >
            Simulated Prototype · Academic Use Only
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.canvas,
  },
  keyboardView: {
    flex: 1,
  },
  container: {
    padding: spacing.screenSide,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing['4xl'],
  },
  brandRow: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  headingBox: {
    marginBottom: spacing.xl,
  },
  title: {
    marginBottom: spacing.xs,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tintRed,
    borderColor: colors.redText,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.base,
  },
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryTint,
    borderColor: colors.primary,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.base,
  },
  feedbackText: {
    flex: 1,
  },
  form: {
    gap: spacing.base,
  },
  submitBtn: {
    marginTop: spacing.sm,
    width: '100%',
  },
  backBtn: {
    width: '100%',
  },
  disclaimerText: {
    marginTop: spacing['2xl'],
  },
});
