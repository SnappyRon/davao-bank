import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Platform,
} from 'react-native';
import { colors, type Profile } from '@davao-bank/shared';
import { supabase } from '../lib/supabase';

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
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Top Branding */}
        <View style={styles.brandRow}>
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>DB</Text>
          </View>
          <Text style={styles.brandTitle}>Davao Bank</Text>
        </View>

        {/* Warning Icon & Status Banner */}
        <View style={styles.alertCard}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>⚠️</Text>
          </View>
          <Text style={styles.alertTitle}>Account Suspended</Text>
          <Text style={styles.alertPrimaryMessage}>
            Your account is suspended — contact Davao Bank
          </Text>
        </View>

        {/* User Details */}
        <View style={styles.infoCard}>
          <Text style={styles.infoHeading}>Account Information</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Account Name</Text>
            <Text style={styles.infoValue}>{profile?.full_name || 'Customer'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{userEmail || '—'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status</Text>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>SUSPENDED</Text>
            </View>
          </View>
        </View>

        {/* Advisory Card */}
        <View style={styles.advisoryCard}>
          <Text style={styles.advisoryTitle}>What does this mean?</Text>
          <Text style={styles.advisoryBody}>
            Banking operations, balance views, transfers, deposits, and cash withdrawals
            have been suspended on this account by bank administration.
          </Text>
          <Text style={styles.advisoryBody}>
            If you believe this was done in error or to reactivate your access, please
            contact Davao Bank customer support immediately.
          </Text>

          <View style={styles.contactBox}>
            <Text style={styles.contactLabel}>Customer Support:</Text>
            <Text style={styles.contactText}>support@davaobank.ph</Text>
            <Text style={styles.contactSubText}>Davao City, Philippines</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {onRefresh && (
            <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
              <Text style={styles.refreshButtonText}>Check Account Status</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  brandBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  brandBadgeText: {
    color: colors.textInverse,
    fontWeight: '900',
    fontSize: 16,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  alertCard: {
    width: '100%',
    backgroundColor: '#FFF5F5',
    borderColor: '#FED7D7',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#E53E3E',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFE3E3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  iconText: {
    fontSize: 28,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.error,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  alertPrimaryMessage: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 22,
  },
  infoCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  infoHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSubtle,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statusPill: {
    backgroundColor: '#FED7D7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '800',
  },
  advisoryCard: {
    width: '100%',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 14,
    padding: 18,
    marginBottom: 28,
  },
  advisoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  advisoryBody: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  contactBox: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  contactLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: 2,
  },
  contactText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  contactSubText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  actionsContainer: {
    width: '100%',
    gap: 12,
  },
  refreshButton: {
    width: '100%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  refreshButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  signOutButton: {
    width: '100%',
    backgroundColor: colors.error,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutButtonText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
});
