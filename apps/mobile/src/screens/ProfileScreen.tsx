import { useConfirmSheet } from '../hooks/useConfirmSheet';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  User,
  Info,
  LogOut,
  ChevronRight,
  Shield,
  ShieldCheck,
  CheckCircle2,
  Users,
  CalendarClock,
  Inbox,
  FileText,
  Lock,
  ScanFace,
  KeyRound,
  EyeOff,
  LayoutGrid,
} from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  fetchUserProfile,
  type Profile,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { useAppLock } from '../context/AppLockContext';
import { useSettings } from '../context/SettingsContext';
import {
  Screen,
  Text,
  Card,
  Badge,
  Button,
  Pressable,
  GroupedList,
  ListHairline,
  groupedListStyles,
  LIST_ICON_SIZE,
  tabScreenBottomClearance,
  useToast,
} from '../components';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

export const APP_VERSION_CAPTION = 'Version 1.0.0 · Simulated prototype';
export const APP_LOCK_SAVE_ERROR = "Couldn't save the app lock setting. Try again.";
export const BIOMETRIC_VERIFY_ERROR = "Couldn't verify it's you. Try again.";
export const SIGN_OUT_ERROR = "Couldn't sign out. Try again.";
export const BIOMETRIC_UNSUPPORTED =
  "Set up Face ID or fingerprint in your phone's settings first.";
export const SIGN_OUT_MESSAGE = 'Sign out of Davao Bank?';
export const biometricSaveError = (biometricType: string) =>
  `Couldn't save the ${biometricType} setting. Try again.`;

interface ProfileScreenProps {
  profile: Profile | null;
  userEmail: string | null;
  onProfileUpdated?: (profile: Profile) => void;
  onSignOut?: () => void;
}

type TwoStepState = 'on' | 'off' | 'unknown';

interface SettingsRowProps {
  icon: React.ReactNode;
  iconBackground?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  /**
   * Switch rows: the whole row is the touch target and the one accessible
   * element (role switch); the native Switch is visual only.
   */
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  switchDisabled?: boolean;
  testID?: string;
}

function SettingsRow({
  icon,
  iconBackground = colors.primaryTint,
  title,
  subtitle,
  onPress,
  switchValue,
  onSwitchChange,
  switchDisabled,
  testID,
}: SettingsRowProps) {
  const body = (
    <>
      <View style={[groupedListStyles.disc, { backgroundColor: iconBackground }]}>
        {icon}
      </View>
      <View style={styles.rowText}>
        <Text variant="bodyStrong" color={colors.ink}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color={colors.textSecondary}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </>
  );

  if (onSwitchChange) {
    const checked = Boolean(switchValue);
    return (
      <Pressable
        onPress={() => onSwitchChange(!checked)}
        disabled={switchDisabled}
        feedbackType="highlight"
        accessibilityRole="switch"
        accessibilityLabel={title}
        accessibilityHint={subtitle}
        accessibilityState={{ checked, disabled: Boolean(switchDisabled) }}
        style={[groupedListStyles.row, styles.row]}
        testID={testID}
      >
        {body}
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Switch
            value={checked}
            disabled={switchDisabled}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      feedbackType="highlight"
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={[groupedListStyles.row, styles.row]}
      testID={testID}
    >
      {body}
      <ChevronRight size={LIST_ICON_SIZE} color={colors.textMuted} />
    </Pressable>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="title" color={colors.ink} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function ProfileScreen({
  profile,
  userEmail,
  onProfileUpdated,
  onSignOut,
}: ProfileScreenProps) {
  const { showConfirmation, confirmSheet } = useConfirmSheet();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const appLock = useAppLock();
  const {
    biometricEnabled,
    setBiometricEnabled,
    biometricType,
    isBiometricSupported,
    hideBalance,
    toggleHideBalance,
  } = useSettings();
  const [signingOut, setSigningOut] = useState(false);
  const [twoStep, setTwoStep] = useState<TwoStepState>('unknown');

  // Optimistic App lock switch (Phase 6.5 device check: the switch felt slow).
  // It moves immediately; if saving fails it reverts and a toast explains.
  const [appLockValue, setAppLockValue] = useState(appLock.enabled);
  const appLockSaving = useRef(false);
  const appLockSaveId = useRef(0);
  // Real stored value, read when the latest save fails.
  const appLockEnabledRef = useRef(appLock.enabled);
  appLockEnabledRef.current = appLock.enabled;
  useEffect(() => {
    if (!appLockSaving.current) setAppLockValue(appLock.enabled);
  }, [appLock.enabled]);

  // Keep the latest callback in a ref: App passes an inline function, so depending
  // on it would re-run this effect after every profile update (refetch loop).
  const onProfileUpdatedRef = useRef(onProfileUpdated);
  onProfileUpdatedRef.current = onProfileUpdated;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function reloadProfile() {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user && active) {
            const { data } = await fetchUserProfile(supabase, user.id);
            if (data && active) {
              onProfileUpdatedRef.current?.(data);
            }
          }
        } catch (err) {
          console.warn('Failed to refetch profile on focus:', err);
        }
      }
      void reloadProfile();
      return () => {
        active = false;
      };
    }, [])
  );

  // Two-step state for the Security row; re-read on focus so it updates after
  // returning from the setup screen.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function loadTwoStep() {
        try {
          const { data, error } = await supabase.auth.mfa.listFactors();
          if (!active) return;
          if (error || !data) {
            setTwoStep('unknown');
            return;
          }
          setTwoStep(data.totp.some((f) => f.status === 'verified') ? 'on' : 'off');
        } catch {
          if (active) setTwoStep('unknown');
        }
      }
      void loadTwoStep();
      return () => {
        active = false;
      };
    }, [])
  );

  const handleAppLockChange = (value: boolean) => {
    setAppLockValue(value);
    const saveId = ++appLockSaveId.current;
    appLockSaving.current = true;
    const isLatest = () => saveId === appLockSaveId.current;
    appLock
      .setEnabled(value)
      .catch(() => {
        // Only the latest save reverts, and to the stored value (an earlier
        // rapid toggle may have saved successfully).
        if (!isLatest()) return;
        setAppLockValue(appLockEnabledRef.current);
        toast.show(APP_LOCK_SAVE_ERROR, 'error');
      })
      .finally(() => {
        if (isLatest()) appLockSaving.current = false;
      });
  };

  const handleBiometricChange = async (nextVal: boolean) => {
    try {
      const ok = await setBiometricEnabled(nextVal);
      if (!ok) toast.show(BIOMETRIC_VERIFY_ERROR, 'error');
    } catch {
      toast.show(biometricSaveError(biometricType), 'error');
    }
  };

  const getInitials = (name?: string | null) => {
    if (!name) return 'DB';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleSignOut = async () => {
    showConfirmation({
      title: 'Sign out',
      message: SIGN_OUT_MESSAGE,
      confirmLabel: 'Sign out',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: async () => {
        setSigningOut(true);
        try {
          await supabase.auth.signOut();
          if (onSignOut) {
            onSignOut();
          }
        } catch (err) {
          console.error('Error signing out:', err);
          toast.show(SIGN_OUT_ERROR, 'error');
        } finally {
          setSigningOut(false);
        }
      },
    });
  };

  const twoStepSubtitle = twoStep === 'on' ? 'On' : twoStep === 'off' ? 'Off' : undefined;
  const iconSize = LIST_ICON_SIZE;

  return (
    <Screen style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: tabScreenBottomClearance(insets.bottom) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="h1" accessibilityRole="header">
          Profile
        </Text>

        {/* Profile card */}
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
                label="Email verified"
                variant="success"
                icon={<CheckCircle2 size={12} color={colors.primary} />}
              />
              {profile?.role === 'admin' ? (
                <Badge label="Staff admin" variant="neutral" />
              ) : null}
            </View>
          </View>
        </Card>

        {/* Money */}
        <View style={styles.section}>
          <SectionTitle>Money</SectionTitle>
          <GroupedList testID="profile-group-money">
            <SettingsRow
              icon={<Users size={iconSize} color={colors.primary} />}
              title="Saved recipients"
              onPress={() => navigation.navigate('SavedRecipients')}
            />
            <ListHairline />
            <SettingsRow
              icon={<CalendarClock size={iconSize} color={colors.primary} />}
              title="Scheduled payments"
              onPress={() => navigation.navigate('ScheduledPayments')}
            />
            <ListHairline />
            <SettingsRow
              icon={<Inbox size={iconSize} color={colors.primary} />}
              title="Payment requests"
              onPress={() => navigation.navigate('PaymentRequests')}
            />
            <ListHairline />
            <SettingsRow
              icon={<FileText size={iconSize} color={colors.primary} />}
              title="Statements"
              onPress={() => navigation.navigate('ExportStatement')}
            />
            <ListHairline />
            <SettingsRow
              icon={<LayoutGrid size={iconSize} color={colors.primary} />}
              title="More services"
              subtitle="Simulation — tools, requests and calculators"
              onPress={() => navigation.navigate('MoreServices')}
            />
          </GroupedList>
        </View>

        {/* Security */}
        <View style={styles.section}>
          <SectionTitle>Security</SectionTitle>
          <GroupedList testID="profile-group-security">
            <SettingsRow
              icon={<Shield size={iconSize} color={colors.primary} />}
              title="Bantay security center"
              subtitle="Daily transfer limit & protections"
              onPress={() => navigation.navigate('BantaySecurity')}
            />
            <ListHairline />
            <SettingsRow
              icon={<ShieldCheck size={iconSize} color={colors.primary} />}
              title="Two-step verification"
              subtitle={twoStepSubtitle}
              onPress={() => navigation.navigate('TwoStepSetup')}
            />
            <ListHairline />
            <SettingsRow
              icon={<Lock size={iconSize} color={colors.primary} />}
              title="App lock"
              subtitle="Lock after 2 minutes in the background"
              switchValue={appLockValue}
              onSwitchChange={handleAppLockChange}
            />
            <ListHairline />
            <SettingsRow
              icon={<ScanFace size={iconSize} color={colors.primary} />}
              title={`Confirm with ${biometricType}`}
              subtitle={
                isBiometricSupported ? 'Use before money moves' : BIOMETRIC_UNSUPPORTED
              }
              switchValue={biometricEnabled}
              onSwitchChange={(value) => void handleBiometricChange(value)}
              switchDisabled={!isBiometricSupported}
            />
            <ListHairline />
            <SettingsRow
              icon={<KeyRound size={iconSize} color={colors.primary} />}
              title="Change password"
              onPress={() => navigation.navigate('ChangePassword')}
            />
          </GroupedList>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <SectionTitle>Settings</SectionTitle>
          <GroupedList testID="profile-group-settings">
            <SettingsRow
              icon={<User size={iconSize} color={colors.primary} />}
              title="Personal details"
              onPress={() => navigation.navigate('PersonalDetails')}
            />
            <ListHairline />
            <SettingsRow
              icon={<EyeOff size={iconSize} color={colors.primary} />}
              title="Hide balances"
              subtitle="Mask amounts on screen"
              switchValue={hideBalance}
              onSwitchChange={() => void toggleHideBalance()}
            />
            <ListHairline />
            <SettingsRow
              icon={<Info size={iconSize} color={colors.blueText} />}
              iconBackground={colors.tintBlue}
              title="About"
              onPress={() => navigation.navigate('About')}
            />
          </GroupedList>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Button
            title="Sign out"
            variant="secondaryDestructive"
            icon={<LogOut size={LIST_ICON_SIZE} color={colors.redText} />}
            onPress={handleSignOut}
            loading={signingOut}
            style={styles.signOutButton}
          />
          <Text variant="caption" color={colors.textMuted} align="center">
            {APP_VERSION_CAPTION}
          </Text>
        </View>
      </ScrollView>

      {confirmSheet}
    </Screen>
  );
}

const AVATAR_SIZE = 60;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.canvas,
  },
  container: {
    paddingHorizontal: spacing.screenSide,
    paddingTop: spacing.base,
    gap: spacing.xl,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderRadius: radius.lg,
  },
  avatarContainer: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
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
  section: {
    gap: spacing.md,
  },
  row: {
    backgroundColor: colors.surface,
  },
  rowText: {
    flex: 1,
  },
  footer: {
    gap: spacing.base,
  },
  signOutButton: {
    width: '100%',
  },
});
