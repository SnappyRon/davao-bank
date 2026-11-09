import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { Mail, Check } from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  toUserMessage,
  fetchUserProfile,
  type Profile,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { FeatureScreen, Text, TextField, Button } from '../components';

export function PersonalDetailsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [initialFullName, setInitialFullName] = useState('');
  const [initialPhoneNumber, setInitialPhoneNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user && mounted) {
          setUserEmail(user.email ?? null);
          const { data } = await fetchUserProfile(supabase, user.id);
          if (data && mounted) {
            setProfile(data);
            const fn = data.full_name || '';
            const ph = data.phone || '';
            setFullName(fn);
            setPhoneNumber(ph);
            setInitialFullName(fn);
            setInitialPhoneNumber(ph);
          }
        }
      } catch (err: unknown) {
        console.warn('Failed to load profile:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const isDirty =
    !loading && (fullName !== initialFullName || phoneNumber !== initialPhoneNumber);

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
        setErrorMsg(toUserMessage(error));
      } else if (data) {
        setSuccessMsg('Profile updated successfully');
        setInitialFullName(data.full_name || '');
        setInitialPhoneNumber(data.phone || '');
        setTimeout(() => {
          navigation.goBack();
        }, 1200);
      }
    } catch (err: unknown) {
      setErrorMsg(toUserMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FeatureScreen
      title="Personal Details"
      isDirty={isDirty}
      isProcessing={saving}
      contentContainerStyle={styles.container}
    >
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <>
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
            <Text
              variant="label"
              color={colors.textSecondary}
              style={styles.readOnlyLabel}
            >
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
        </>
      )}
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xl,
    gap: spacing.base,
  },
  loadingContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
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
