import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ShieldCheck,
  Lock,
  KeyRound,
  ChevronRight,
  AlertCircle,
} from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  formatCentavosToPHP,
  phpToCentavos,
} from '@davao-bank/shared';
import type { RootStackParamList } from '../../App';
import { supabase } from '../lib/supabase';
import { useAppLock } from '../context/AppLockContext';
import { useSettings } from '../context/SettingsContext';
import { useTotpPrompt } from '../context/PasswordPromptContext';
import { useInFlightGuard } from '../hooks/useInFlightGuard';
import { retryStepUp } from '../utils/stepUpRetry';
import {
  DAILY_LIMIT_MIN_CENTAVOS,
  DAILY_LIMIT_MAX_CENTAVOS,
  fetchSecuritySettings,
  phase8UserMessage,
  type SecuritySettings,
} from '../hooks/usePhase8Contracts';
import {
  FeatureScreen,
  Text,
  Card,
  Button,
  AmountText,
  AmountInput,
  EmptyState,
  Skeleton,
  Pressable,
  GroupedList,
  ListHairline,
  groupedListStyles,
  LIST_ICON_SIZE,
  useToast,
} from '../components';
import { StepUpSetupLink } from '../components/StepUpSetupLink';

const BAR_HEIGHT = 8;
const SKELETON_CARD_HEIGHT = 180;
const SKELETON_ROW_HEIGHT = 64;
const LIMIT_PRESETS = [10000, 50000, 100000, 500000];

type TwoStepState = 'on' | 'off' | 'unknown';

function normalizeReturnedSettings(
  raw: unknown,
  fallbackLimit: number,
  previous: SecuritySettings
): SecuritySettings {
  const row = (Array.isArray(raw) ? raw[0] : raw) as
    Partial<SecuritySettings> | null | undefined;
  if (row && typeof row.daily_transfer_limit_centavos !== 'undefined') {
    return {
      daily_transfer_limit_centavos: Number(row.daily_transfer_limit_centavos) || 0,
      spent_today_centavos: Number(row.spent_today_centavos) || 0,
      remaining_today_centavos: Number(row.remaining_today_centavos) || 0,
    };
  }
  const spent = previous.spent_today_centavos;
  return {
    daily_transfer_limit_centavos: fallbackLimit,
    spent_today_centavos: spent,
    remaining_today_centavos: Math.max(fallbackLimit - spent, 0),
  };
}

export function BantaySecurityScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const toast = useToast();
  const appLock = useAppLock();
  const { hideBalance, confirmBiometricPayment } = useSettings();
  const promptTotp = useTotpPrompt();
  const guardSave = useInFlightGuard();

  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [twoStep, setTwoStep] = useState<TwoStepState>('unknown');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [newLimitStr, setNewLimitStr] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [secRes, mfaRes] = await Promise.all([
        fetchSecuritySettings(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (seq !== loadSeqRef.current) return;

      if (secRes.error) {
        setSettings(null);
        setLoadError(phase8UserMessage(secRes.error));
      } else {
        setSettings(secRes.data);
      }

      if (!mfaRes.error && mfaRes.data) {
        setTwoStep(
          mfaRes.data.totp.some((factor) => factor.status === 'verified') ? 'on' : 'off'
        );
      } else {
        setTwoStep('unknown');
      }
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      setSettings(null);
      setLoadError(phase8UserMessage(err));
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const startEditing = () => {
    setInputError(null);
    setSaveError(null);
    if (settings && !hideBalance) {
      setNewLimitStr((settings.daily_transfer_limit_centavos / 100).toString());
    } else {
      setNewLimitStr('');
    }
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (saving) return;
    setIsEditing(false);
    setNewLimitStr('');
    setInputError(null);
    setSaveError(null);
  };

  const handleSaveLimit = async () => {
    if (!settings) return;
    setInputError(null);
    setSaveError(null);

    const centavos = phpToCentavos(newLimitStr);
    if (centavos < DAILY_LIMIT_MIN_CENTAVOS || centavos > DAILY_LIMIT_MAX_CENTAVOS) {
      setInputError('Enter a limit between ₱1,000.00 and ₱500,000.00.');
      return;
    }

    setSaving(true);
    try {
      const authResult = await confirmBiometricPayment({
        title: 'Authorize limit change',
        message: `Confirm changing your daily transfer limit to ${formatCentavosToPHP(centavos)}`,
      });
      if (!authResult.success) {
        setSaveError(
          authResult.cancelled
            ? 'Not authorized. Daily limit was not changed.'
            : authResult.error || 'Not authorized. Daily limit was not changed.'
        );
        return;
      }

      const { data, error } = await retryStepUp(
        () =>
          supabase.rpc('set_daily_limit', {
            p_limit_centavos: centavos,
          }),
        promptTotp
      );

      if (error) {
        setSaveError(phase8UserMessage(error));
        return;
      }

      setSettings(normalizeReturnedSettings(data, centavos, settings));
      setIsEditing(false);
      setNewLimitStr('');
      toast.show('Daily limit updated');
    } catch (err) {
      setSaveError(phase8UserMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const limit = settings?.daily_transfer_limit_centavos ?? 0;
  const spent = settings?.spent_today_centavos ?? 0;
  const remaining = settings?.remaining_today_centavos ?? 0;
  const usedRatio = limit > 0 ? Math.min(Math.max(spent / limit, 0), 1) : 0;
  const usedPct = Math.round(usedRatio * 100);
  const barColor =
    usedPct >= 100 ? colors.redText : usedPct >= 80 ? colors.orangeText : colors.primary;

  const twoStepSubtitle =
    twoStep === 'on'
      ? 'On · Authenticator app active'
      : twoStep === 'off'
        ? 'Off · Set up required before sending money'
        : 'Check status';

  return (
    <FeatureScreen
      title="Bantay security center"
      isDirty={isEditing && newLimitStr.trim().length > 0}
      isProcessing={saving}
    >
      {loading ? (
        <View style={styles.section} testID="bantay-loading">
          <Skeleton width="100%" height={SKELETON_CARD_HEIGHT} style={styles.skeleton} />
          <Skeleton width="100%" height={SKELETON_ROW_HEIGHT} style={styles.skeleton} />
          <Skeleton width="100%" height={SKELETON_ROW_HEIGHT} style={styles.skeleton} />
        </View>
      ) : loadError ? (
        <EmptyState
          title="Security settings unavailable"
          description={loadError}
          icon={<AlertCircle size={32} color={colors.redText} />}
          actionTitle="Try again"
          onAction={() => void load()}
          scrollable={false}
        />
      ) : !settings ? (
        <EmptyState
          title="No security settings"
          description="Your daily transfer limit settings could not be found."
          icon={<ShieldCheck size={32} color={colors.textMuted} />}
          actionTitle="Try again"
          onAction={() => void load()}
          scrollable={false}
        />
      ) : (
        <View style={styles.content}>
          {/* Daily Transfer Limit Card */}
          <Card variant="default" style={styles.limitCard}>
            <View style={styles.cardHeader}>
              <View style={[groupedListStyles.disc, styles.headerDisc]}>
                <ShieldCheck size={LIST_ICON_SIZE} color={colors.primary} />
              </View>
              <View style={styles.headerText}>
                <Text variant="title" color={colors.ink} accessibilityRole="header">
                  Daily transfer limit
                </Text>
                <Text variant="caption" color={colors.textSecondary}>
                  Applies to transfers and bill payments each day
                </Text>
              </View>
            </View>

            <View style={styles.limitAmountRow}>
              <AmountText
                amountCentavos={limit}
                hidden={hideBalance}
                variant="amount"
                color={colors.ink}
                showSign={false}
                maxFontSizeMultiplier={1.4}
              />
            </View>

            <View
              style={styles.barTrack}
              accessible
              accessibilityLabel={`Daily limit ${usedPct} percent used`}
            >
              <View
                style={[
                  styles.barFill,
                  { width: `${usedPct}%`, backgroundColor: barColor },
                ]}
              />
            </View>

            <View style={styles.metrics}>
              <View style={styles.metricRow}>
                <Text variant="body" color={colors.textSecondary}>
                  Spent today
                </Text>
                <AmountText
                  amountCentavos={spent}
                  hidden={hideBalance}
                  variant="bodyStrong"
                  color={colors.ink}
                  showSign={false}
                  maxFontSizeMultiplier={1.4}
                />
              </View>
              <View style={styles.metricRow}>
                <Text variant="body" color={colors.textSecondary}>
                  Remaining today
                </Text>
                <AmountText
                  amountCentavos={remaining}
                  hidden={hideBalance}
                  variant="bodyStrong"
                  color={remaining === 0 ? colors.redText : colors.primary}
                  showSign={false}
                  maxFontSizeMultiplier={1.4}
                />
              </View>
            </View>

            {isEditing ? (
              <View style={styles.editSection}>
                <AmountInput
                  label="New daily limit"
                  value={newLimitStr}
                  onChangeText={(val) => {
                    setNewLimitStr(val);
                    if (inputError) setInputError(null);
                  }}
                  presetAmounts={LIMIT_PRESETS}
                  helperText="₱1,000.00 to ₱500,000.00"
                  error={inputError}
                />

                {saveError ? (
                  <View style={styles.errorBanner}>
                    <AlertCircle size={18} color={colors.redText} />
                    <Text
                      variant="caption"
                      color={colors.redText}
                      accessibilityRole="alert"
                      style={styles.errorText}
                    >
                      {saveError}
                    </Text>
                  </View>
                ) : null}

                <StepUpSetupLink error={saveError} onClose={() => navigation.goBack()} />

                <View style={styles.editButtons}>
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={cancelEditing}
                    disabled={saving}
                    style={styles.halfBtn}
                  />
                  <Button
                    title={saving ? 'Saving…' : 'Save limit'}
                    onPress={() => void guardSave(handleSaveLimit)}
                    loading={saving}
                    disabled={!newLimitStr.trim()}
                    style={styles.halfBtn}
                  />
                </View>
              </View>
            ) : (
              <Button
                title="Change daily limit"
                variant="secondary"
                onPress={startEditing}
              />
            )}
          </Card>

          {/* Protections Status Links */}
          <View style={styles.section}>
            <Text variant="title" color={colors.ink} accessibilityRole="header">
              Protections
            </Text>
            <GroupedList>
              <Pressable
                onPress={() => navigation.navigate('TwoStepSetup')}
                feedbackType="highlight"
                accessibilityRole="button"
                accessibilityLabel={`Two-step verification, ${twoStepSubtitle}`}
                style={groupedListStyles.row}
              >
                <View style={[groupedListStyles.disc, styles.headerDisc]}>
                  <ShieldCheck size={LIST_ICON_SIZE} color={colors.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text variant="bodyStrong" color={colors.ink}>
                    Two-step verification
                  </Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    {twoStepSubtitle}
                  </Text>
                </View>
                <ChevronRight size={LIST_ICON_SIZE} color={colors.textMuted} />
              </Pressable>

              <ListHairline />

              <Pressable
                onPress={() => navigation.goBack()}
                feedbackType="highlight"
                accessibilityRole="button"
                accessibilityLabel={`App lock, ${appLock.enabled ? 'On' : 'Off'}`}
                style={groupedListStyles.row}
              >
                <View style={[groupedListStyles.disc, styles.headerDisc]}>
                  <Lock size={LIST_ICON_SIZE} color={colors.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text variant="bodyStrong" color={colors.ink}>
                    App lock
                  </Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    {appLock.enabled
                      ? 'On · Lock after 2 minutes'
                      : 'Off · Manage in Profile'}
                  </Text>
                </View>
                <ChevronRight size={LIST_ICON_SIZE} color={colors.textMuted} />
              </Pressable>

              <ListHairline />

              <Pressable
                onPress={() => navigation.navigate('ChangePassword')}
                feedbackType="highlight"
                accessibilityRole="button"
                accessibilityLabel="Change password"
                style={groupedListStyles.row}
              >
                <View style={[groupedListStyles.disc, styles.headerDisc]}>
                  <KeyRound size={LIST_ICON_SIZE} color={colors.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text variant="bodyStrong" color={colors.ink}>
                    Change password
                  </Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    Update your sign-in password
                  </Text>
                </View>
                <ChevronRight size={LIST_ICON_SIZE} color={colors.textMuted} />
              </Pressable>
            </GroupedList>
          </View>
        </View>
      )}
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
  skeleton: {
    borderRadius: radius.md,
  },
  limitCard: {
    padding: spacing.lg,
    borderRadius: radius.md,
    gap: spacing.base,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerDisc: {
    backgroundColor: colors.primaryTint,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  limitAmountRow: {
    paddingTop: spacing.xs,
  },
  barTrack: {
    height: BAR_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSubtle,
    overflow: 'hidden',
  },
  barFill: {
    height: BAR_HEIGHT,
    borderRadius: radius.pill,
  },
  metrics: {
    gap: spacing.sm,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editSection: {
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.tintRed,
  },
  errorText: {
    flex: 1,
  },
  editButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  halfBtn: {
    flex: 1,
  },
  rowText: {
    flex: 1,
  },
});
