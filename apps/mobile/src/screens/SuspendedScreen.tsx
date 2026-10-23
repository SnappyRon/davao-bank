import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { ShieldAlert, LogOut, RefreshCw } from 'lucide-react-native';
import { colors, radius, spacing, type Profile } from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { Screen, Text, Button, Card, Badge, Logo } from '../components';

interface SuspendedScreenProps {
  profile: Profile | null;
  userEmail: string | null;
  onRefresh?: () => void;
  onSignOut?: () => void;
}

export function SuspendedScreen({
  profile,
  userEmail,
  onRefresh,
  onSignOut,
}: SuspendedScreenProps) {
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      if (onSignOut) {
        onSignOut();
      }
    } catch (err) {
      console.error('Failed to sign out from suspended screen:', err);
    }
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoRow}>
          <Logo variant="horizontal" size={36} />
        </View>

        <Card variant="default" style={styles.alertCard}>
          <View style={styles.iconCircle}>
            <ShieldAlert size={36} color={colors.redText} />
          </View>
          <Text variant="h1" align="center" style={styles.title}>
            Account Suspended
          </Text>
          <Badge label="SUSPENDED" variant="danger" style={styles.badge} />
          <Text
            variant="body"
            color={colors.textSecondary}
            align="center"
            style={styles.description}
          >
            Your account is suspended — contact Davao Bank for assistance. Access to money
            operations and account features is restricted.
          </Text>
          <Text
            variant="bodyStrong"
            color={colors.ink}
            align="center"
            style={styles.instruction}
          >
            Please contact Davao Bank staff or support for assistance.
          </Text>
        </Card>

        <Card variant="subtle" style={styles.infoCard}>
          <Text variant="caption" color={colors.textMuted} style={styles.infoLabel}>
            ACCOUNT HOLDER
          </Text>
          <Text variant="bodyStrong" color={colors.ink}>
            {profile?.full_name || 'Customer'}
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            {userEmail || 'No email associated'}
          </Text>
        </Card>

        <View style={styles.actionContainer}>
          {onRefresh ? (
            <Button
              title="Check Status Again"
              variant="secondary"
              icon={<RefreshCw size={18} color={colors.ink} />}
              onPress={onRefresh}
              style={styles.button}
            />
          ) : null}
          <Button
            title="Sign Out"
            variant="destructive"
            icon={<LogOut size={18} color={colors.textInverse} />}
            onPress={handleSignOut}
            style={styles.button}
          />
        </View>
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
  logoRow: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  alertCard: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    marginBottom: spacing.base,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    backgroundColor: colors.tintRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  title: {
    marginBottom: spacing.xs,
  },
  badge: {
    marginVertical: spacing.sm,
  },
  description: {
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  instruction: {
    marginTop: spacing.md,
  },
  infoCard: {
    padding: spacing.base,
    borderRadius: radius.md,
    marginBottom: spacing.xl,
  },
  infoLabel: {
    marginBottom: spacing.xs,
    letterSpacing: 0.5,
  },
  reasonBox: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actionContainer: {
    gap: spacing.md,
  },
  button: {
    width: '100%',
  },
});
