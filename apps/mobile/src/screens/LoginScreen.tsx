import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { LogIn, AlertCircle } from 'lucide-react-native';
import { colors, spacing, radius, toUserMessage } from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { Screen, Text, TextField, Button, Card, Logo } from '../components';

interface LoginScreenProps {
  onNavigateToSignUp: () => void;
  onNavigateToForgotPassword: () => void;
  onNavigateToVerifyEmail: (email: string) => void;
}

export function LoginScreen({
  onNavigateToSignUp,
  onNavigateToForgotPassword,
  onNavigateToVerifyEmail,
}: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          onNavigateToVerifyEmail(email.trim());
          return;
        }
        setErrorMessage(toUserMessage(error));
        return;
      }

      if (data.user && !data.user.email_confirmed_at) {
        await supabase.auth.signOut();
        onNavigateToVerifyEmail(email.trim());
        return;
      }
    } catch (err: any) {
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
              Welcome back
            </Text>
            <Text variant="body" color={colors.textSecondary}>
              Sign in to manage your simulated Davao Bank accounts.
            </Text>
          </View>

          {errorMessage ? (
            <Card variant="subtle" style={styles.errorCard}>
              <AlertCircle size={18} color={colors.redText} />
              <Text variant="caption" color={colors.redText} style={styles.errorText}>
                {errorMessage}
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

            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
            />

            <TouchableOpacity
              onPress={onNavigateToForgotPassword}
              style={styles.forgotBtn}
              activeOpacity={0.7}
            >
              <Text variant="caption" color={colors.primary}>
                Forgot your password?
              </Text>
            </TouchableOpacity>

            <Button
              title="Sign In"
              onPress={handleLogin}
              loading={loading}
              icon={<LogIn size={18} color={colors.textInverse} />}
              style={styles.submitBtn}
            />
          </View>

          <View style={styles.footerRow}>
            <Text variant="body" color={colors.textSecondary}>
              Don't have an account?{' '}
            </Text>
            <TouchableOpacity onPress={onNavigateToSignUp} activeOpacity={0.7}>
              <Text variant="bodyStrong" color={colors.primary}>
                Sign Up
              </Text>
            </TouchableOpacity>
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
  errorText: {
    flex: 1,
  },
  form: {
    gap: spacing.base,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: -spacing.xs,
  },
  submitBtn: {
    marginTop: spacing.sm,
    width: '100%',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing['2xl'],
    marginBottom: spacing.base,
  },
  disclaimerText: {
    marginTop: spacing.sm,
  },
});
