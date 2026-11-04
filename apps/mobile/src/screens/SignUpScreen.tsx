import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { UserPlus, AlertCircle } from 'lucide-react-native';
import { colors, spacing, radius, toUserMessage } from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { Screen, Text, TextField, Button, Card, Logo } from '../components';

interface SignUpScreenProps {
  onNavigateToLogin: () => void;
  onSignUpSuccess: (email: string) => void;
}

export function SignUpScreen({ onNavigateToLogin, onSignUpSuccess }: SignUpScreenProps) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSignUp = async () => {
    if (!fullName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim() || null,
          },
        },
      });

      if (error) {
        setErrorMessage(toUserMessage(error));
        return;
      }

      if (data.user) {
        onSignUpSuccess(email.trim());
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
              Create account
            </Text>
            <Text variant="body" color={colors.textSecondary}>
              Join Davao Bank to receive a simulated PHP account.
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
              label="Full Legal Name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="e.g. Maria Santos"
              autoCapitalize="words"
            />

            <TextField
              label="Mobile Number (Optional)"
              value={phone}
              onChangeText={setPhone}
              placeholder="+63 917 123 4567"
              keyboardType="phone-pad"
            />

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
              label="Password (min 6 characters)"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
            />

            <TextField
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
            />

            <Button
              title="Create Account"
              onPress={handleSignUp}
              loading={loading}
              icon={<UserPlus size={18} color={colors.textInverse} />}
              style={styles.submitBtn}
            />
          </View>

          <View style={styles.footerRow}>
            <Text variant="body" color={colors.textSecondary}>
              Already have an account?{' '}
            </Text>
            <TouchableOpacity onPress={onNavigateToLogin} activeOpacity={0.7}>
              <Text variant="bodyStrong" color={colors.primary}>
                Sign In
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
    paddingTop: spacing.xl,
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
