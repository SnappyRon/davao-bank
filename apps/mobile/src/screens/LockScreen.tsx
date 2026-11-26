import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  StyleSheet,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { colors, spacing } from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { Button, Text, TextField, Logo } from '../components';

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [passwordMode, setPasswordMode] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [biometricTitle, setBiometricTitle] = useState('Unlock');
  const [biometricAvailable, setBiometricAvailable] = useState(true);
  const inFlight = useRef(false);

  useEffect(() => {
    async function checkBiometrics() {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHardware || !isEnrolled) {
          setBiometricAvailable(false);
          setBiometricTitle('Unlock');
          return;
        }
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricTitle('Unlock with Face ID');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricTitle('Unlock with Touch ID');
        } else {
          setBiometricTitle('Unlock');
        }
      } catch {
        setBiometricAvailable(false);
        setBiometricTitle('Unlock');
      }
    }
    void checkBiometrics();
  }, []);

  const unlock = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      if (
        !(await LocalAuthentication.hasHardwareAsync()) ||
        !(await LocalAuthentication.isEnrolledAsync())
      ) {
        setPasswordMode(true);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Davao Bank',
        disableDeviceFallback: true,
        cancelLabel: 'Use password',
      });
      if (result.success) onUnlock();
      else {
        setPasswordMode(true);
        setError('Use your password or try unlocking again.');
      }
    } catch {
      setPasswordMode(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [onUnlock]);

  const initial = useRef(false);
  useEffect(() => {
    if (!initial.current) {
      initial.current = true;
      void unlock();
    }
  }, [unlock]);

  const checkPassword = async () => {
    if (inFlight.current || !password) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user?.email) {
        setError('Session unavailable. Please sign out and sign in again.');
        return;
      }
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      setPassword('');
      if (authError) setError('Incorrect password. Please try again.');
      else onUnlock();
    } catch {
      setError('Could not verify your password. Please try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      testID="app-lock-screen"
      style={{ flex: 1, backgroundColor: colors.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <Logo size={64} />
          </View>
          <Text variant="h1" style={styles.title}>
            Davao Bank is locked
          </Text>
          {!!error && (
            <Text
              accessibilityRole="alert"
              color={colors.redText}
              style={styles.errorText}
            >
              {error}
            </Text>
          )}

          {passwordMode ? (
            <View style={styles.formContainer}>
              <TextField
                label="Account password"
                accessibilityLabel="Account password"
                placeholder="Enter password"
                secureTextEntry
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
                editable={!busy}
              />
              <Button
                title="Unlock with password"
                disabled={busy || !password}
                loading={busy}
                onPress={() => void checkPassword()}
              />
              {biometricAvailable && (
                <Button
                  title={biometricTitle}
                  variant="ghost"
                  disabled={busy}
                  onPress={() => {
                    setPasswordMode(false);
                    void unlock();
                  }}
                />
              )}
            </View>
          ) : (
            <View style={styles.actionContainer}>
              <Button
                title={biometricTitle}
                disabled={busy}
                loading={busy}
                onPress={() => void unlock()}
              />
              <Button
                title="Use password"
                variant="ghost"
                disabled={busy}
                onPress={() => setPasswordMode(true)}
              />
            </View>
          )}

          <Button
            title="Sign out"
            variant="ghost"
            disabled={busy}
            style={styles.signOutBtn}
            onPress={() => {
              void supabase.auth.signOut();
            }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  content: {
    gap: spacing.base,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  logoContainer: {
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  errorText: {
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
    gap: spacing.base,
  },
  actionContainer: {
    width: '100%',
    gap: spacing.base,
  },
  signOutBtn: {
    marginTop: spacing.sm,
  },
});
