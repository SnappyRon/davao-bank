import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import {
  User,
  Info,
  LogOut,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Users,
  CalendarClock,
  Inbox,
} from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  fetchAccountBalances,
  type Profile,
  type AccountBalance,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { useAppLock } from '../context/AppLockContext';
import { useSettings } from '../context/SettingsContext';
import { Screen, Text, Card, Badge, Button } from '../components';
import { TwoStepSetup } from '../components/TwoStepSetup';
import { PersonalDetailsModal } from './PersonalDetailsModal';
import { AboutModal } from './AboutModal';
import { SavedRecipientsModal } from './SavedRecipientsModal';
import { ScheduledPaymentsModal } from './ScheduledPaymentsModal';
import { PaymentRequestsModal } from './PaymentRequestsModal';

interface ProfileScreenProps {
  setupTwoStep?: boolean;
  onSetupClosed?: () => void;
  profile: Profile | null;
  userEmail: string | null;
  onProfileUpdated?: (profile: Profile) => void;
  onSignOut?: () => void;
}

export function ProfileScreen({
  setupTwoStep,
  onSetupClosed,
  profile,
  userEmail,
  onProfileUpdated,
  onSignOut,
}: ProfileScreenProps) {
  const appLock = useAppLock();
  const { biometricEnabled, setBiometricEnabled, biometricType, isBiometricSupported } =
    useSettings();
  const [twoStepOpen, setTwoStepOpen] = useState(false);
  const [personalDetailsOpen, setPersonalDetailsOpen] = useState(false);
  const [savedRecipientsOpen, setSavedRecipientsOpen] = useState(false);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (requestsOpen) {
      fetchAccountBalances(supabase).then(({ data }) => {
        if (data) setAccounts(data);
      });
    }
  }, [requestsOpen]);

  useEffect(() => {
    if (setupTwoStep) setTwoStepOpen(true);
  }, [setupTwoStep]);
  const closeSetup = () => {
    setTwoStepOpen(false);
    onSetupClosed?.();
  };

  const getInitials = (name?: string | null) => {
    if (!name) return 'DB';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of Davao Bank?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await supabase.auth.signOut();
            if (onSignOut) {
              onSignOut();
            }
          } catch (err) {
            console.error('Error signing out:', err);
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  if (twoStepOpen)
    return (
      <Screen>
        <TwoStepSetup onClose={closeSetup} />
      </Screen>
    );

  return (
    <Screen style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="h1" style={styles.screenTitle}>
          Profile
        </Text>

        {/* Profile Card */}
        <Card variant="default" style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            {profile?.full_name ? (
              <Text variant="h2" color={colors.primary}>
                {getInitials(profile.full_name)}
              </Text>
            ) : (
              <User size={32} color={colors.primary} />
            )}
          </View>

          <View style={styles.profileDetails}>
            <Text variant="title" color={colors.ink}>
              {profile?.full_name || 'Davao Bank Customer'}
            </Text>
            <Text variant="body" color={colors.textSecondary}>
              {userEmail || 'No email registered'}
            </Text>

            <View style={styles.badgeRow}>
              <Badge
                label="Email Verified"
                variant="success"
                icon={<CheckCircle2 size={12} color={colors.primary} />}
              />
              {profile?.role === 'admin' ? (
                <Badge label="Staff Admin" variant="neutral" />
              ) : null}
            </View>
          </View>
        </Card>

        {/* Menu Section */}
        <View style={styles.menuSection}>
          <Text variant="label" color={colors.textMuted} style={styles.sectionHeader}>
            ACCOUNT SETTINGS
          </Text>

          <TouchableOpacity
            style={styles.menuRow}
            activeOpacity={0.7}
            onPress={() => setPersonalDetailsOpen(true)}
          >
            <View style={styles.menuIconContainer}>
              <User size={20} color={colors.primary} />
            </View>
            <View style={styles.menuTextContainer}>
              <Text variant="bodyStrong" color={colors.ink}>
                Personal Details
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
                Manage your legal name and contact phone
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Saved Recipients Row (§B.1) */}
          <TouchableOpacity
            style={styles.menuRow}
            activeOpacity={0.7}
            onPress={() => setSavedRecipientsOpen(true)}
          >
            <View style={styles.menuIconContainer}>
              <Users size={20} color={colors.primary} />
            </View>
            <View style={styles.menuTextContainer}>
              <Text variant="bodyStrong" color={colors.ink}>
                Saved Recipients
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
                Manage trusted Davao Bank accounts for fast transfers
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.menuRow}>
            <Text variant="bodyStrong">App lock</Text>
            <Switch
              accessibilityLabel="App lock"
              value={appLock.enabled}
              onValueChange={(value) => {
                void appLock
                  .setEnabled(value)
                  .catch(() => Alert.alert('Could not save app lock setting'));
              }}
            />
          </View>
          {/* Biometrics Toggle Row (§B.4) */}
          <View style={styles.menuRow}>
            <View style={styles.menuIconContainer}>
              <ShieldCheck size={20} color={colors.green} />
            </View>
            <View style={styles.menuTextContainer}>
              <Text variant="bodyStrong" color={colors.ink}>
                Confirm with {biometricType}
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
                {isBiometricSupported
                  ? 'Require biometric confirmation before money moves'
                  : 'Device biometric hardware not enrolled'}
              </Text>
            </View>
            <Switch
              value={biometricEnabled}
              disabled={!isBiometricSupported}
              onValueChange={async (nextVal) => {
                const ok = await setBiometricEnabled(nextVal);
                if (!ok) {
                  Alert.alert(
                    'Verification Required',
                    'Biometric verification is required to turn off payment protection.'
                  );
                }
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>

          {/* Scheduled Payments Row (§C) */}
          <TouchableOpacity
            style={styles.menuRow}
            activeOpacity={0.7}
            onPress={() => setScheduledOpen(true)}
          >
            <View style={styles.menuIconContainer}>
              <CalendarClock size={20} color={colors.primary} />
            </View>
            <View style={styles.menuTextContainer}>
              <Text variant="bodyStrong" color={colors.ink}>
                Scheduled Payments
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
                View and manage recurring transfers and bill payments
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Payment Requests Row (§D) */}
          <TouchableOpacity
            style={styles.menuRow}
            activeOpacity={0.7}
            onPress={() => setRequestsOpen(true)}
          >
            <View style={styles.menuIconContainer}>
              <Inbox size={20} color={colors.primary} />
            </View>
            <View style={styles.menuTextContainer}>
              <Text variant="bodyStrong" color={colors.ink}>
                Payment Requests
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
                Review incoming requests and track outgoing requests
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuRow}
            activeOpacity={0.7}
            onPress={() => setAboutOpen(true)}
          >
            <View style={styles.menuIconContainer}>
              <Info size={20} color={colors.blueText} />
            </View>
            <View style={styles.menuTextContainer}>
              <Text variant="bodyStrong" color={colors.ink}>
                About Davao Bank
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
                Academic prototype disclosure & brand credits
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Sign Out Button */}
        <View style={styles.signOutContainer}>
          <Button
            title="Sign Out"
            variant="destructive"
            icon={<LogOut size={18} color={colors.textInverse} />}
            onPress={handleSignOut}
            loading={signingOut}
            style={styles.signOutButton}
          />
        </View>

        <Text
          variant="caption"
          color={colors.textMuted}
          align="center"
          style={styles.disclaimerText}
        >
          Davao Bank · Academic Prototype v1.0.0
        </Text>
      </ScrollView>

      {/* Modals */}
      <Button title="Two-step verification" onPress={() => setTwoStepOpen(true)} />
      <PersonalDetailsModal
        visible={personalDetailsOpen}
        profile={profile}
        userEmail={userEmail}
        onClose={() => setPersonalDetailsOpen(false)}
        onUpdated={(p) => {
          if (onProfileUpdated) onProfileUpdated(p);
        }}
      />

      <AboutModal visible={aboutOpen} onClose={() => setAboutOpen(false)} />

      <SavedRecipientsModal
        visible={savedRecipientsOpen}
        onClose={() => setSavedRecipientsOpen(false)}
      />

      <ScheduledPaymentsModal
        visible={scheduledOpen}
        onClose={() => setScheduledOpen(false)}
      />

      <PaymentRequestsModal
        visible={requestsOpen}
        onClose={() => setRequestsOpen(false)}
        accounts={accounts}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.canvas,
  },
  container: {
    padding: spacing.screenSide,
    paddingTop: spacing.base,
    paddingBottom: spacing['4xl'],
  },
  screenTitle: {
    marginBottom: spacing.base,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderRadius: radius.lg,
    marginBottom: spacing.xl,
  },
  avatarContainer: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.base,
  },
  profileDetails: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  menuSection: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    letterSpacing: 0.5,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  menuTextContainer: {
    flex: 1,
  },
  signOutContainer: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  signOutButton: {
    width: '100%',
  },
  disclaimerText: {
    lineHeight: 18,
  },
});
