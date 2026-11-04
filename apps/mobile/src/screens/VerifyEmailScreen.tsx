import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import {
  Mail,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react-native';
import { colors, spacing, radius, toUserMessage } from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { Screen, Text, Button, Card, Logo } from '../components';

interface VerifyEmailScreenProps {
  email: string;
  onNavigateToLogin: () => void;
}

export function VerifyEmailScreen({ email, onNavigateToLogin }: VerifyEmailScreenProps) {
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    setMessage(null);
    setError(null);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
      });

      if (resendError) {
        setError(toUserMessage(resendError));
      } else {
        setMessage('A new verification email has been sent. Please check your inbox.');
      }
    } catch (err: unknown) {
      setError(toUserMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <Logo variant="horizontal" size={44} />
        </View>

        <Card variant="default" style={styles.card}>
          <View style={styles.iconCircle}>
            <Mail size={36} color={colors.primary} />
          </View>

          <Text variant="h1" align="center" style={styles.title}>
            Verify your email
          </Text>

          <Text variant="body" color={colors.textSecondary} align="center">
            We sent a verification link to your registered email:
          </Text>

          <View style={styles.emailBadge}>
            <Text variant="bodyStrong" color={colors.ink}>
              {email || 'your email'}
            </Text>
          </View>

          <Text
            variant="caption"
            color={colors.textMuted}
            align="center"
            style={styles.hintText}
          >
            Click the link inside the email to activate your Davao Bank simulated account.
          </Text>

          {message ? (
            <Card variant="subtle" style={styles.successCard}>
              <CheckCircle2 size={16} color={colors.primary} />
              <Text variant="caption" color={colors.primary} style={styles.feedbackText}>
                {message}
              </Text>
            </Card>
          ) : null}

          {error ? (
            <Card variant="subtle" style={styles.errorCard}>
              <AlertCircle size={16} color={colors.redText} />
              <Text variant="caption" color={colors.redText} style={styles.feedbackText}>
                {error}
              </Text>
            </Card>
          ) : null}

          <View style={styles.buttonGroup}>
            <Button
              title="Resend Verification Email"
              variant="secondary"
              icon={<RefreshCw size={18} color={colors.ink} />}
              onPress={handleResend}
              loading={resending}
              style={styles.button}
            />

            <Button
              title="Back to Sign In"
              variant="ghost"
              icon={<ArrowLeft size={18} color={colors.primary} />}
              onPress={onNavigateToLogin}
              style={styles.button}
            />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.canvas,
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
  card: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: radius.lg,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  title: {
    marginBottom: spacing.xs,
  },
  emailBadge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    marginVertical: spacing.base,
  },
  hintText: {
    lineHeight: 18,
    marginBottom: spacing.base,
  },
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryTint,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.base,
    width: '100%',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tintRed,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.base,
    width: '100%',
  },
  feedbackText: {
    flex: 1,
  },
  buttonGroup: {
    width: '100%',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  button: {
    width: '100%',
  },
});
