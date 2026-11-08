import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { colors, spacing } from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { Button, Text, TextField } from '../components';

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [passwordMode, setPasswordMode] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
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
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: spacing.xl,
        }}
      >
        <View style={{ gap: spacing.base }}>
          <Text variant="h1">Davao Bank is locked</Text>
          {!!error && <Text accessibilityRole="alert">{error}</Text>}
          {passwordMode && (
            <>
              <TextField
                label="Account password"
                accessibilityLabel="Account password"
                secureTextEntry
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
                editable={!busy}
              />
              <Button
                title="Unlock with password"
                disabled={busy || !password}
                onPress={() => void checkPassword()}
              />
            </>
          )}
          <Button title="Unlock" disabled={busy} onPress={() => void unlock()} />
          <Button
            title="Use password"
            variant="ghost"
            disabled={busy}
            onPress={() => setPasswordMode(true)}
          />
          <Button
            title="Sign out"
            variant="ghost"
            disabled={busy}
            onPress={() => {
              void supabase.auth.signOut();
            }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
