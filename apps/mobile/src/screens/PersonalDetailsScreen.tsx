import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
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
import { reportNetworkResult } from '../lib/networkStatus';
import { MASCOT_ERROR } from '../assets/illustrations';
import {
  FeatureScreen,
  Text,
  TextField,
  Button,
  EmptyState,
  Skeleton,
  useToast,
} from '../components';

export function PersonalDetailsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [initialFullName, setInitialFullName] = useState('');
  const [initialPhoneNumber, setInitialPhoneNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      reportNetworkResult(userErr);
      if (userErr) {
        setLoadError(toUserMessage(userErr, 'load'));
        return;
      }
      if (!user) {
        setLoadError(toUserMessage('Not authenticated', 'load'));
        return;
      }

      setUserEmail(user.email ?? null);
      const { data, error: profileErr } = await fetchUserProfile(supabase, user.id);
      reportNetworkResult(profileErr);

      if (profileErr) {
        setLoadError(toUserMessage(profileErr, 'load'));
        return;
      }

      if (data) {
        setProfile(data);
        const fn = data.full_name || '';
        const ph = data.phone || '';
        setFullName(fn);
        setPhoneNumber(ph);
        setInitialFullName(fn);
        setInitialPhoneNumber(ph);
      }
    } catch (err: unknown) {
reportNetworkResult(err);
      setLoadError(toUserMessage(err, 'load'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty =
    !loading &&
    !saved &&
    (fullName !== initialFullName || phoneNumber !== initialPhoneNumber);

  const handleSave = async () => {
    if (!profile || saving || saved) return;
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
        setErrorMsg(toUserMessage(error, 'load'));
        setSaving(false);
      } else if (data) {
        const trimmedName = data.full_name ? data.full_name.trim() : '';
        const trimmedPhone = data.phone ? data.phone.trim() : '';
        setSuccessMsg('Profile updated successfully');
        toast.show('Personal details saved');
        setFullName(trimmedName);
        setPhoneNumber(trimmedPhone);
        setInitialFullName(trimmedName);
        setInitialPhoneNumber(trimmedPhone);
        setSaving(false);
        setSaved(true);
        timeoutRef.current = setTimeout(() => {
          navigation.goBack();
        }, 1200);
      }
    } catch (err: unknown) {
      setErrorMsg(toUserMessage(err, 'load'));
      setSaving(false);
    }
  };

  return (
    <FeatureScreen
      title="Personal details"
      isDirty={isDirty}
      isProcessing={saving}
      contentContainerStyle={styles.container}
    >
      {loading ? (
        <View
          style={styles.skeletonStack}
          accessibilityRole="progressbar"
          accessibilityLabel="Loading personal details"
          testID="personal-details-skeleton"
        >
          <Skeleton width="100%" height={52} borderRadius={radius.md} />
          <Skeleton width="100%" height={52} borderRadius={radius.md} />
          <Skeleton width="100%" height={52} borderRadius={radius.md} />
        </View>
      ) : loadError ? (
        <EmptyState
          title="Profile unavailable"
          description={loadError}
          descriptionAccessibilityRole="alert"
          illustration={MASCOT_ERROR}
          illustrationTestID="personal-details-error-mascot"
          actionTitle="Try again"
          onAction={() => void load()}
          scrollable={false}
        />
      ) : (
        <>
          <TextField
            label="Full name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="e.g. Maria Santos"
            autoCapitalize="words"
          />

          <TextField
            label="Phone number"
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
              Email (read-only)
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
              title="Save changes"
              onPress={handleSave}
              loading={saving}
              disabled={!profile || saving || saved}
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
  skeletonStack: {
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
