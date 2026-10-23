import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import {
  User,
  Info,
  LogOut,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react-native';
import { colors, spacing, radius, type Profile } from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { Screen, Text, Card, Badge, Button } from '../components';
import { PersonalDetailsModal } from './PersonalDetailsModal';
import { AboutModal } from './AboutModal';

interface ProfileScreenProps {
  profile: Profile | null;
  userEmail: string | null;
  onProfileUpdated?: (profile: Profile) => void;
  onSignOut?: () => void;
}

export function ProfileScreen({
  profile,
  userEmail,
  onProfileUpdated,
  onSignOut,
}: ProfileScreenProps) {
  const [personalDetailsOpen, setPersonalDetailsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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
            <Text variant="h2" color={colors.primary}>
              {getInitials(profile?.full_name)}
            </Text>
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
