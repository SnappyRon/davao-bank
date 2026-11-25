import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, radius, toUserMessage } from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { usePasswordPrompt, useTotpPrompt } from '../context/PasswordPromptContext';
import { FeatureScreen, Text, TextField, Button, ResultView } from '../components';
import type { RootStackParamList } from '../../App';

/** Mirrors supabase/config.toml: minimum_password_length = 10, letters_digits. */
export const MIN_PASSWORD_LENGTH = 10;

export const PASSWORD_TOO_SHORT = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
export const PASSWORD_NEEDS_LETTER_AND_DIGIT =
  'Include at least one letter and one number.';
export const PASSWORD_MISMATCH = "Passwords don't match.";
export const PASSWORD_NOT_CHANGED = 'Not authorized. Your password was not changed.';
export const PASSWORD_SAME = 'Choose a password that is different from your current one.';
export const PASSWORD_WEAK = `Use at least ${MIN_PASSWORD_LENGTH} characters with letters and numbers.`;
export const PASSWORD_CHANGE_FAILED = "Couldn't change your password. Try again.";
export const PASSWORD_OFFLINE =
  'You appear to be offline. Your password was not changed.';
export const PASSWORD_REAUTH_FAILED = "Couldn't confirm it's you. Try again.";
export const TWO_STEP_LOAD_FAILED = "Couldn't load two-step verification. Try again.";

export function validateNewPassword(value: string): string | null {
  if (value.length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT;
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value))
    return PASSWORD_NEEDS_LETTER_AND_DIGIT;
  return null;
}

const RATE_LIMIT_CODES = new Set([
  'over_request_rate_limit',
  'over_email_send_rate_limit',
  'over_sms_send_rate_limit',
]);
const REAUTH_CODES = new Set(['insufficient_aal', 'reauthentication_needed']);

function isOfflineError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  const message = String((error as { message?: string } | null)?.message || '');
  const lower = message.toLowerCase();
  return (
    name === 'AuthRetryableFetchError' ||
    lower.includes('network request failed') ||
    lower.includes('failed to fetch')
  );
}

/**
 * Password-change errors are decided here by error code and a few known
 * cases (`toUserMessage` has no password mappings and its fallback is about
 * money). Rate limits reuse `toUserMessage`'s mapping. Never shows the raw
 * server message.
 */
export function changePasswordErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'same_password') return PASSWORD_SAME;
  if (code === 'weak_password') return PASSWORD_WEAK;
  if (code && REAUTH_CODES.has(code)) return PASSWORD_REAUTH_FAILED;
  if (code && RATE_LIMIT_CODES.has(code)) return toUserMessage('rate limit', 'account');
  if (isOfflineError(error)) return PASSWORD_OFFLINE;
  return PASSWORD_CHANGE_FAILED;
}

export function ChangePasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const promptPassword = usePasswordPrompt();
  const promptTotp = useTotpPrompt();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newError, setNewError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const mounted = useRef(true);
  // Set before the first await so a double tap can't start a second run;
  // holds the id of the run that owns `submitting`.
  const inFlight = useRef<number | null>(null);
  const runSeq = useRef(0);
  const confirmRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      // Password values live only in component state, which is discarded on
      // unmount; the flag stops late async results from writing to it.
      mounted.current = false;
    };
  }, []);

  const isDirty = !done && (newPassword.length > 0 || confirmPassword.length > 0);

  const handleSubmit = async () => {
    if (inFlight.current !== null || done) return;
    const lengthOrCharsError = validateNewPassword(newPassword);
    const mismatchError =
      !lengthOrCharsError && newPassword !== confirmPassword ? PASSWORD_MISMATCH : null;
    setNewError(lengthOrCharsError);
    setConfirmError(mismatchError);
    setFormError(null);
    if (lengthOrCharsError || mismatchError) return;

    const runId = ++runSeq.current;
    inFlight.current = runId;
    const stop = (message: string | null) => {
      if (inFlight.current !== runId) return;
      inFlight.current = null;
      if (!mounted.current) return;
      setFormError(message);
      setSubmitting(false);
    };
    setSubmitting(true);
    try {
      // 1. Current password, always typed (Face ID alone is not enough to
      //    change the password). This re-signs in, which leaves the session aal1.
      const first = await promptPassword({
        title: 'Confirm your password',
        message: 'Enter your current password to change it.',
      });
      if (!mounted.current) return;
      if (!first.success) {
        stop(
          first.cancelled ? PASSWORD_NOT_CHANGED : first.error || PASSWORD_NOT_CHANGED
        );
        return;
      }

      // 2. Authenticator code when a verified factor exists, so the session is
      //    aal2 again before the update.
      const { data: factors, error: factorsError } =
        await supabase.auth.mfa.listFactors();
      if (!mounted.current) return;
      if (factorsError || !factors) {
        stop(TWO_STEP_LOAD_FAILED);
        return;
      }
      if (factors.totp.some((factor) => factor.status === 'verified')) {
        const second = await promptTotp();
        if (!mounted.current) return;
        if (!second.success) {
          stop(
            second.cancelled ? PASSWORD_NOT_CHANGED : second.error || PASSWORD_NOT_CHANGED
          );
          return;
        }
      }

      // 3. Update.
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (!mounted.current) return;
      if (error) {
        stop(changePasswordErrorMessage(error));
        return;
      }
      if (inFlight.current !== runId) return;
      inFlight.current = null;
      setNewPassword('');
      setConfirmPassword('');
      setNewError(null);
      setConfirmError(null);
      setFormError(null);
      setSubmitting(false);
      setDone(true);
    } catch (err) {
      stop(changePasswordErrorMessage(err));
    }
  };

  if (done) {
    return (
      <FeatureScreen title="Change password">
        <ResultView
          outcome="completed"
          title="Password changed"
          details={[{ label: 'Next sign-in', value: 'Use your new password' }]}
          onDone={() => navigation.goBack()}
        />
      </FeatureScreen>
    );
  }

  return (
    <FeatureScreen
      title="Change password"
      isDirty={isDirty}
      isProcessing={submitting}
      footer={
        <Button
          title={submitting ? 'Changing…' : 'Change password'}
          onPress={() => void handleSubmit()}
          loading={submitting}
          disabled={submitting || (!newPassword && !confirmPassword)}
        />
      }
    >
      <Text variant="body" color={colors.textSecondary}>
        {`${PASSWORD_WEAK} You will confirm with your current password first.`}
      </Text>

      <View style={styles.fields}>
        <TextField
          label="New password"
          value={newPassword}
          onChangeText={(value) => {
            setNewPassword(value);
            if (newError) setNewError(null);
          }}
          error={newError}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <TextField
          ref={confirmRef}
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={(value) => {
            setConfirmPassword(value);
            if (confirmError) setConfirmError(null);
          }}
          error={confirmError}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          returnKeyType="done"
          onSubmitEditing={() => void handleSubmit()}
        />
      </View>

      {formError ? (
        <View style={styles.errorBox}>
          <Text
            variant="body"
            color={colors.redText}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {formError}
          </Text>
        </View>
      ) : null}
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: spacing.base,
  },
  errorBox: {
    backgroundColor: colors.tintRed,
    borderRadius: radius.md,
    padding: spacing.base,
  },
});
