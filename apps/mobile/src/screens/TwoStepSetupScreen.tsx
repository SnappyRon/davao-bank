import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Linking, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { ShieldCheck, Copy, ExternalLink, AlertCircle } from 'lucide-react-native';
import { colors, spacing, radius } from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { FeatureScreen, Text, Button, Card, useToast } from '../components';
import { AuthenticatorCode } from '../components/AuthenticatorCode';

type Factor = { id: string; friendly_name?: string; created_at: string };
type Enrollment = { id: string; secret: string; uri: string };

export function TwoStepSetupScreen() {
  const toast = useToast();

  const [factor, setFactor] = useState<Factor | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const pendingId = useRef<string | null>(null);
  const mounted = useRef(true);
  const [step, setStep] = useState<1 | 2>(1);
  const [disabling, setDisabling] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setBusy(true);
    const { data, error: loadError } = await supabase.auth.mfa.listFactors();
    if (!mounted.current) return;
    if (loadError) {
      setError('Could not load two-step verification. Please try again.');
    } else {
      setFactor(data.totp.find((f) => f.status === 'verified') || null);
    }
    setBusy(false);
  };

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      const id = pendingId.current;
      pendingId.current = null;
      if (id) void supabase.auth.mfa.unenroll({ factorId: id });
    };
  }, []);

  const enroll = async () => {
    setBusy(true);
    setError('');
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Davao Bank',
      });
      if (enrollError || !data) throw new Error('enrollment');
      if (!mounted.current) {
        await supabase.auth.mfa.unenroll({ factorId: data.id });
        return;
      }
      pendingId.current = data.id;
      setEnrollment({ id: data.id, secret: data.totp.secret, uri: data.totp.uri });
      setStep(1);
    } catch {
      setError('Could not start setup. Please try again.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const verify = async (code: string) => {
    const id = enrollment?.id || factor?.id;
    if (!id) return false;
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: id,
      code,
    });
    if (verifyError) return false;
    if (disabling) {
      const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (removeError) return false;
    } else pendingId.current = null;
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      setError('Please sign in again to refresh your session.');
      return false;
    }
    setEnrollment(null);
    setDisabling(false);
    await load();
    return true;
  };

  const handleCopySecret = async () => {
    if (!enrollment?.secret) return;
    await Clipboard.setStringAsync(enrollment.secret);
    toast.show('Setup key copied');
  };

  const handleOpenApp = async () => {
    if (!enrollment?.uri) return;
    try {
      await Linking.openURL(enrollment.uri);
    } catch {
      setError('No authenticator app could open this link. Use the setup key instead.');
    }
  };

  const isEnrolling = Boolean(enrollment);

  return (
    <FeatureScreen
      title="Two-step verification"
      isDirty={isEnrolling}
      isProcessing={busy}
      step={isEnrolling ? step : undefined}
      stepCount={isEnrolling ? 2 : undefined}
      onPrevStep={isEnrolling && step === 2 ? () => setStep(1) : undefined}
      footer={
        isEnrolling && step === 1 ? (
          <Button title="Continue" onPress={() => setStep(2)} style={styles.fullWidth} />
        ) : !isEnrolling && !disabling && !factor ? (
          <Button
            title="Set up authenticator"
            onPress={() => void enroll()}
            loading={busy}
            style={styles.fullWidth}
          />
        ) : null
      }
    >
      {error ? (
        <Card variant="subtle" style={styles.errorCard}>
          <AlertCircle size={18} color={colors.redText} />
          <Text variant="caption" color={colors.redText} style={styles.errorText}>
            {error}
          </Text>
        </Card>
      ) : null}

      {/* Enrolled View */}
      {factor && !disabling && !isEnrolling ? (
        <View style={styles.container}>
          <Card variant="default" style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <ShieldCheck size={28} color={colors.primary} />
              <View style={styles.statusDetails}>
                <Text variant="title" color={colors.ink}>
                  Two-step verification is on
                </Text>
                <Text variant="caption" color={colors.textSecondary}>
                  {factor.friendly_name || 'Authenticator app'} · added{' '}
                  {new Date(factor.created_at).toLocaleDateString()}
                </Text>
              </View>
            </View>
            <Text variant="body" color={colors.textSecondary}>
              Your account requires a 6-digit code from your authenticator app for every
              money transfer, cash-out, or bill payment.
            </Text>
          </Card>

          <Button
            title="Turn off two-step verification"
            variant="secondary"
            onPress={() => setDisabling(true)}
            style={{ ...styles.fullWidth, ...styles.turnOffBtn }}
          />
        </View>
      ) : null}

      {/* Disabling View */}
      {disabling ? (
        <View style={styles.container}>
          <Card variant="subtle" style={styles.disablingWarningCard}>
            <Text variant="bodyStrong" color={colors.redText}>
              Turning off verification
            </Text>
            <Text variant="body" color={colors.textSecondary}>
              Turning this off blocks sending money until you set it up again. Enter a
              fresh code from your app to turn it off.
            </Text>
          </Card>

          <View style={styles.codeContainer}>
            <AuthenticatorCode verify={verify} onCancel={() => setDisabling(false)} />
          </View>
        </View>
      ) : null}

      {/* Enrollment Step 1 */}
      {isEnrolling && step === 1 && enrollment ? (
        <View style={styles.container}>
          <Text variant="body" color={colors.textSecondary}>
            Scan this QR code with your authenticator app (such as Google Authenticator,
            1Password, or iCloud Keychain), or copy the key below.
          </Text>

          {/* 200 pt QR on centered white container */}
          <View style={styles.qrContainer}>
            <View style={styles.qrCard}>
              <QRCode value={enrollment.uri} size={200} />
            </View>
          </View>

          {/* Monospace Setup Key Box with Copy */}
          <Card variant="subtle" style={styles.secretBox}>
            <View style={styles.secretTextWrapper}>
              <Text variant="caption" color={colors.textMuted}>
                SETUP KEY
              </Text>
              <Text variant="bodyStrong" tabularNums style={styles.monospaceSecret}>
                {enrollment.secret}
              </Text>
            </View>
            <Button
              title="Copy"
              variant="secondary"
              onPress={() => void handleCopySecret()}
              icon={<Copy size={16} color={colors.primary} />}
              style={styles.copyBtn}
            />
          </Card>

          <Button
            title="Open in authenticator app"
            variant="secondary"
            onPress={() => void handleOpenApp()}
            icon={<ExternalLink size={16} color={colors.primary} />}
            style={styles.fullWidth}
          />
        </View>
      ) : null}

      {/* Enrollment Step 2 */}
      {isEnrolling && step === 2 && enrollment ? (
        <View style={styles.container}>
          <Text variant="body" color={colors.textSecondary}>
            Enter the 6-digit code shown in your authenticator app to verify setup.
          </Text>

          <View style={styles.codeContainer}>
            <AuthenticatorCode verify={verify} onCancel={() => setStep(1)} />
          </View>
        </View>
      ) : null}
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.base,
  },
  fullWidth: {
    width: '100%',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tintRed,
    borderColor: colors.redText,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: {
    flex: 1,
  },
  statusCard: {
    padding: spacing.lg,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusDetails: {
    flex: 1,
  },
  turnOffBtn: {
    marginTop: spacing.sm,
  },
  disablingWarningCard: {
    padding: spacing.base,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
  },
  qrCard: {
    backgroundColor: colors.surface,
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  secretBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  secretTextWrapper: {
    flex: 1,
  },
  monospaceSecret: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1,
    marginTop: 2,
  },
  copyBtn: {
    minWidth: 88,
  },
  codeContainer: {
    marginTop: spacing.md,
  },
});
