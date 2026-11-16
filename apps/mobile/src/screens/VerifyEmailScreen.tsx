import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import {
  Mail,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  MailCheck,
} from 'lucide-react-native';
import { colors, spacing, radius, toUserMessage } from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { Screen, Text, Button, Card, Logo } from '../components';

interface VerifyEmailScreenProps {
  email: string;
  onNavigateToLogin: () => void;
  /** True right after sign-up: an email was just sent, so Resend starts cooling down. */
  justSent?: boolean;
}

/** Seconds before another verification email can be requested (spec 7B.4). */
export const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyEmailScreen({
  email,
  onNavigateToLogin,
  justSent = false,
}: VerifyEmailScreenProps) {
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(justSent ? RESEND_COOLDOWN_SECONDS : 0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One tick per second while cooling down.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  /**
   * Refreshes the session so a confirmed email reaches the app. App's
   * `onAuthStateChange` then re-runs the gate (`email_confirmed_at`), so the
   * user moves on without anything else here. Signed out (sign-up without a
   * session, reported as AuthSessionMissingError): sign in instead, which
   * runs the same gate. Any other error stays here with a message.
   */
  const handleVerified = async () => {
    setChecking(true);
    setMessage(null);
    setError(null);
    try {
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      const session = data?.session;
      const signedOut =
        (!refreshError && !session) || refreshError?.name === 'AuthSessionMissingError';
      if (signedOut) {
        onNavigateToLogin();
        return;
      }
      if (refreshError || !session) {
        setError(toUserMessage(refreshError));
        return;
      }
      if (!session.user?.email_confirmed_at) {
        setError(
          "Your email isn't verified yet. Tap the link in the email, then try again."
        );
      }
    } catch (err: unknown) {
      setError(toUserMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    if (!email || cooldown > 0) return;
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
        setMessage('We sent a new verification email. Check your inbox.');
        setCooldown(RESEND_COOLDOWN_SECONDS);
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
            Tap the link in the email, then come back and tap "I've verified".
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
              title="I've verified my email"
              icon={<MailCheck size={18} color={colors.textInverse} />}
              onPress={() => void handleVerified()}
              loading={checking}
              style={styles.button}
            />

            <Button
              title={cooldown > 0 ? `Resend in ${cooldown} s` : 'Resend email'}
              variant="secondary"
              icon={
                <RefreshCw
                  size={18}
                  color={cooldown > 0 ? colors.textMuted : colors.ink}
                />
              }
              onPress={handleResend}
              loading={resending}
              disabled={cooldown > 0}
              style={styles.button}
            />

            <Button
              title="Back to sign in"
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
