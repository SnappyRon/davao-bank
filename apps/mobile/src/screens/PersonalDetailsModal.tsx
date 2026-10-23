import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { User, Phone, Mail, Check } from 'lucide-react-native';
import { colors, spacing, radius, type Profile } from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { BottomSheet, Text, TextField, Button } from '../components';

interface PersonalDetailsModalProps {
  visible: boolean;
  profile: Profile | null;
  userEmail: string | null;
  onClose: () => void;
  onUpdated: (updatedProfile: Profile) => void;
}

export function PersonalDetailsModal({
  visible,
  profile,
  userEmail,
  onClose,
  onUpdated,
}: PersonalDetailsModalProps) {
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phoneNumber, setPhoneNumber] = useState(profile?.phone || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhoneNumber(profile.phone || '');
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [profile, visible]);

  const handleSave = async () => {
    if (!profile) return;
    if (!fullName.trim()) {
      setErrorMsg('Full name cannot be empty');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: phoneNumber.trim() || null,
        })
        .eq('id', profile.id)
        .select()
        .single();

      if (error) {
        setErrorMsg(error.message);
      } else if (data) {
        setSuccessMsg('Profile updated successfully');
        onUpdated(data as Profile);
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update personal details');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Personal Details">
      <ScrollView contentContainerStyle={styles.container}>
        <TextField
          label="Full Name"
          value={fullName}
          onChangeText={setFullName}
          placeholder="e.g. Maria Santos"
          autoCapitalize="words"
        />

        <TextField
          label="Phone Number"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          placeholder="e.g. +63 917 123 4567"
          keyboardType="phone-pad"
        />

        <View style={styles.readOnlyContainer}>
          <Text variant="label" color={colors.textSecondary} style={styles.readOnlyLabel}>
            Email Address (Read-only)
          </Text>
          <View style={styles.readOnlyInput}>
            <Mail size={18} color={colors.textMuted} style={styles.readOnlyIcon} />
            <Text variant="body" color={colors.textSecondary}>
              {userEmail || 'No email on record'}
            </Text>
          </View>
          <Text variant="caption" color={colors.textMuted} style={styles.helperText}>
            To change your registered email, contact bank support.
          </Text>
        </View>

        {errorMsg ? (
          <Text variant="caption" color={colors.redText} style={styles.feedbackText}>
            {errorMsg}
          </Text>
        ) : null}

        {successMsg ? (
          <View style={styles.successRow}>
            <Check size={16} color={colors.primary} />
            <Text variant="caption" color={colors.primary}>
              {successMsg}
            </Text>
          </View>
        ) : null}

        <View style={styles.buttonRow}>
          <Button
            title="Save Changes"
            onPress={handleSave}
            loading={saving}
            style={styles.saveButton}
          />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xl,
    gap: spacing.base,
  },
  readOnlyContainer: {
    marginBottom: spacing.xs,
  },
  readOnlyLabel: {
    marginBottom: spacing.xs,
  },
  readOnlyInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  readOnlyIcon: {
    marginRight: spacing.sm,
  },
  helperText: {
    marginTop: spacing.xs,
  },
  feedbackText: {
    marginTop: spacing.xs,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  buttonRow: {
    marginTop: spacing.md,
  },
  saveButton: {
    width: '100%',
  },
});
