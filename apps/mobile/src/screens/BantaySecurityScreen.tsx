import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Unlock,
  KeyRound,
  ChevronRight,
  AlertCircle,
  Info,
  Smartphone,
  Sliders,
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
import { useConfirmSheet } from '../hooks/useConfirmSheet';
import {
  DAILY_LIMIT_MIN_CENTAVOS,
  DAILY_LIMIT_MAX_CENTAVOS,
  fetchSecuritySettings,
  setDailyLimitRpc,
  lockMyAccountRpc,
  requestUnlockRpc,
  completeUnlockRpc,
  fetchSecurityTimeline,
  markEventRpc,
  explainBantayEvent,
  phase8UserMessage,
  type SecuritySettings,
  type SecurityEvent,
} from '../hooks/usePhase8Contracts';
import { bantayTemplate, bantayEventTitle } from '../utils/bantayTemplates';
import {
  FeatureScreen,
  Text,
  Card,
  Button,
  AmountInput,
  AmountText,
  EmptyState,
  Skeleton,
  Pressable,
  GroupedList,
  ListHairline,
  Badge,
  groupedListStyles,
  LIST_ICON_SIZE,
  useToast as useComponentToast,
} from '../components';
import { StepUpSetupLink } from '../components/StepUpSetupLink';

const BAR_HEIGHT = 8;
const SKELETON_CARD_HEIGHT = 180;
const SKELETON_ROW_HEIGHT = 64;
const LIMIT_PRESETS = [10000, 50000, 100000, 500000];

type TwoStepState = 'on' | 'off' | 'unknown';

function formatEventTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

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
      locked: Boolean(row.locked),
      unlock_after: typeof row.unlock_after === 'string' ? row.unlock_after : null,
      pending_limit_centavos:
        row.pending_limit_centavos != null ? Number(row.pending_limit_centavos) : null,
      pending_limit_effective_at:
        typeof row.pending_limit_effective_at === 'string'
          ? row.pending_limit_effective_at
          : null,
    };
  }
  const spent = previous.spent_today_centavos;
  return {
    daily_transfer_limit_centavos: fallbackLimit,
    spent_today_centavos: spent,
    remaining_today_centavos: Math.max(fallbackLimit - spent, 0),
    locked: previous.locked,
    unlock_after: previous.unlock_after,
    pending_limit_centavos: previous.pending_limit_centavos,
    pending_limit_effective_at: previous.pending_limit_effective_at,
  };
}

function renderTimelineIcon(kind: string) {
  switch (kind) {
    case 'risky_payment_challenged':
    case 'risky_payment_warning':
      return <ShieldAlert size={LIST_ICON_SIZE} color={colors.orangeText} />;
    case 'risky_payment_confirmed':
      return <CheckCircle2 size={LIST_ICON_SIZE} color={colors.primary} />;
    case 'new_device':
      return <Smartphone size={LIST_ICON_SIZE} color={colors.blueText} />;
    case 'signin_failures':
    case 'code_failures':
      return <Lock size={LIST_ICON_SIZE} color={colors.redText} />;
    case 'password_changed':
    case 'mfa_changed':
      return <KeyRound size={LIST_ICON_SIZE} color={colors.blueText} />;
    case 'limit_changed':
      return <Sliders size={LIST_ICON_SIZE} color={colors.ink} />;
    case 'account_locked':
      return <Lock size={LIST_ICON_SIZE} color={colors.redText} />;
    case 'account_unlocked':
      return <Unlock size={LIST_ICON_SIZE} color={colors.primary} />;
    default:
      return <ShieldCheck size={LIST_ICON_SIZE} color={colors.primary} />;
  }
}

export function BantaySecurityScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const toast = useComponentToast();
  const appLock = useAppLock();
  const { hideBalance, confirmBiometricPayment } = useSettings();
  const promptTotp = useTotpPrompt();
  const guardSave = useInFlightGuard();
  const { showConfirmation, confirmSheet } = useConfirmSheet();

  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [timeline, setTimeline] = useState<SecurityEvent[]>([]);
  const [twoStep, setTwoStep] = useState<TwoStepState>('unknown');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [newLimitStr, setNewLimitStr] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [unlockActionLoading, setUnlockActionLoading] = useState(false);

  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [secRes, mfaRes, timelineRes] = await Promise.all([
        fetchSecuritySettings(),
        supabase.auth.mfa.listFactors(),
        fetchSecurityTimeline(50),
      ]);
      if (seq !== loadSeqRef.current) return;

      if (secRes.error) {
        setSettings(null);
        setLoadError(phase8UserMessage(secRes.error));
      } else {
        setSettings(secRes.data);
      }

      if (!timelineRes.error && timelineRes.data) {
        setTimeline(timelineRes.data);
      } else {
        setTimeline([]);
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

  const handleLockAccount = () => {
    showConfirmation({
      title: 'Lock account',
      message:
        'Locked accounts can’t send or receive money until they are unlocked. Scheduled payments pause while locked.',
      confirmLabel: 'Lock account',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: async () => {
        try {
          const { error } = await lockMyAccountRpc();
          if (error) {
            toast.show(phase8UserMessage(error), 'error');
          } else {
            toast.show('Account locked.', 'error');
            await load();
          }
        } catch (err) {
          toast.show(phase8UserMessage(err), 'error');
        }
      },
    });
  };

  const handleRequestUnlock = async () => {
    setUnlockActionLoading(true);
    try {
      const bioResult = await confirmBiometricPayment({
        title: 'Request unlock',
        message: 'Confirm your identity to request unlocking your account.',
      });
      if (!bioResult.success) {
        if (bioResult.cancelled) {
          toast.show('Unlock request was cancelled.', 'info');
        } else {
          toast.show(bioResult.error || 'Authorization failed.', 'error');
        }
        return;
      }
      const { data, error } = await retryStepUp(() => requestUnlockRpc(), promptTotp);
      if (error) {
        toast.show(phase8UserMessage(error), 'error');
      } else {
        toast.show('Unlock requested. 1-hour wait started.');
        if (data) setSettings(data);
        else await load();
      }
    } catch (err) {
      toast.show(phase8UserMessage(err), 'error');
    } finally {
      setUnlockActionLoading(false);
    }
  };

  const handleCompleteUnlock = async () => {
    setUnlockActionLoading(true);
    try {
      const bioResult = await confirmBiometricPayment({
        title: 'Unlock account',
        message: 'Confirm your identity to unlock your account.',
      });
      if (!bioResult.success) {
        if (bioResult.cancelled) {
          toast.show('Unlock was cancelled.', 'info');
        } else {
          toast.show(bioResult.error || 'Authorization failed.', 'error');
        }
        return;
      }
      const { data, error } = await retryStepUp(() => completeUnlockRpc(), promptTotp);
      if (error) {
        toast.show(phase8UserMessage(error), 'error');
      } else {
        toast.show('Account unlocked. Outgoing money is available.');
        if (data) setSettings(data);
        else await load();
      }
    } catch (err) {
      toast.show(phase8UserMessage(err), 'error');
    } finally {
      setUnlockActionLoading(false);
    }
  };

  const handleMarkEvent = async (
    eventId: string,
    status: 'confirmed_me' | 'reported_not_me'
  ) => {
    try {
      const { error } = await markEventRpc(eventId, status);
      if (error) {
        toast.show(phase8UserMessage(error), 'error');
      } else {
        toast.show(status === 'confirmed_me' ? 'Confirmed as you' : 'Reported activity');
        await load();
      }
    } catch (err) {
      toast.show(phase8UserMessage(err), 'error');
    }
  };

  const handleReportNotMe = (event: SecurityEvent) => {
    showConfirmation({
      title: 'Report suspicious activity',
      message: 'Reporting this will lock your account to protect your money.',
      confirmLabel: 'Report & lock',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: async () => {
        await handleMarkEvent(event.id, 'reported_not_me');
      },
    });
  };

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
    setInputError(null);
    setSaveError(null);
    setNewLimitStr('');
  };

  const handleSelectPreset = (pesos: number) => {
    setNewLimitStr(pesos.toString());
    setInputError(null);
    setSaveError(null);
  };

  const handleSaveLimit = async () => {
    if (!settings) return;
    setInputError(null);
    setSaveError(null);

    const centavos = phpToCentavos(newLimitStr.trim());
    if (
      isNaN(centavos) ||
      centavos < DAILY_LIMIT_MIN_CENTAVOS ||
      centavos > DAILY_LIMIT_MAX_CENTAVOS
    ) {
      setInputError('Enter a limit between ₱1,000.00 and ₱500,000.00.');
      return;
    }

    if (centavos === settings.daily_transfer_limit_centavos) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    try {
      const bioMessage = `Confirm changing daily transfer limit to ${formatCentavosToPHP(centavos)}`;
      const bioResult = await confirmBiometricPayment({
        title: 'Change daily limit',
        message: bioMessage,
      });

      if (!bioResult.success) {
        setSaving(false);
        if (bioResult.cancelled) {
          setSaveError('Not authorized. Daily limit was not changed.');
        } else {
          setSaveError(bioResult.error || 'Authorization failed.');
        }
        return;
      }

      const { data, error } = await retryStepUp(
        () => setDailyLimitRpc(centavos),
        promptTotp
      );

      if (error) {
        setSaveError(phase8UserMessage(error));
        setSaving(false);
        return;
      }

      const updated = normalizeReturnedSettings(data, centavos, settings);
      setSettings(updated);
      setIsEditing(false);
      setSaving(false);
      toast.show('Daily limit updated');
    } catch (err) {
      setSaveError(phase8UserMessage(err));
      setSaving(false);
    }
  };

  const isOffline = loadError && loadError.toLowerCase().includes('offline');

  const twoStepSubtitle =
    twoStep === 'on'
      ? 'On · Authenticator app'
      : twoStep === 'off'
        ? 'Off · Recommended for security'
        : 'Loading…';

  const isLocked = Boolean(settings?.locked);
  const unlockAfterDate = settings?.unlock_after ? new Date(settings.unlock_after) : null;
  const isUnlockReady = unlockAfterDate ? unlockAfterDate.getTime() <= Date.now() : false;

  return (
    <FeatureScreen title="Bantay security center" onBack={() => navigation.goBack()}>
      {isOffline ? (
        <View style={styles.offlineBanner}>
          <Text variant="caption" color={colors.ink}>
            You’re offline — data will refresh when you’re back
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.content} testID="bantay-loading">
          <Skeleton
            height={SKELETON_CARD_HEIGHT}
            style={styles.skeleton}
            testID="bantay-status-skeleton"
          />
          <Skeleton
            height={SKELETON_CARD_HEIGHT}
            style={styles.skeleton}
            testID="bantay-skeleton-card"
          />
          <View style={styles.section}>
            <Skeleton height={SKELETON_ROW_HEIGHT} style={styles.skeleton} />
            <Skeleton height={SKELETON_ROW_HEIGHT} style={styles.skeleton} />
          </View>
        </View>
      ) : loadError && !settings ? (
        <View style={styles.content}>
          <EmptyState
            title="Security settings unavailable"
            description={loadError}
            actionTitle="Try again"
            onAction={() => void load()}
          />
        </View>
      ) : !settings ? (
        <View style={styles.content}>
          <EmptyState
            title="No security settings"
            description="Your security settings could not be found."
            actionTitle="Try again"
            onAction={() => void load()}
          />
        </View>
      ) : (
        <View style={styles.content}>
          {/* Status Card (§1.1) */}
          <Card style={styles.statusCard}>
            <View style={styles.cardHeader}>
              <View
                style={[
                  groupedListStyles.disc,
                  isLocked ? styles.lockedDisc : styles.headerDisc,
                ]}
              >
                {isLocked ? (
                  <Lock size={LIST_ICON_SIZE} color={colors.redText} />
                ) : (
                  <ShieldCheck size={LIST_ICON_SIZE} color={colors.primary} />
                )}
              </View>
              <View style={styles.headerText}>
                <Text variant="title" color={colors.ink} accessibilityRole="header">
                  {isLocked ? 'Account locked' : 'Protected'}
                </Text>
                <Text variant="caption" color={colors.textSecondary}>
                  {isLocked
                    ? unlockAfterDate
                      ? isUnlockReady
                        ? 'Unlock request is ready'
                        : `You can unlock at ${formatEventTime(settings.unlock_after || '')}`
                      : 'Locked for outgoing money'
                    : 'Outgoing transfers and bills are checked'}
                </Text>
              </View>
            </View>

            {settings.pending_limit_centavos ? (
              <View style={styles.pendingLimitRow}>
                <Info size={16} color={colors.orangeText} />
                <Text variant="caption" color={colors.orangeText} style={{ flex: 1 }}>
                  Limit change pending · Applies 12 h from request
                </Text>
              </View>
            ) : null}

            {isLocked ? (
              unlockAfterDate ? (
                <Button
                  title={isUnlockReady ? 'Unlock' : 'Unlock (countdown in progress)'}
                  variant={isUnlockReady ? 'primary' : 'secondary'}
                  disabled={!isUnlockReady || unlockActionLoading}
                  loading={unlockActionLoading}
                  onPress={handleCompleteUnlock}
                  accessibilityLabel="Unlock account"
                />
              ) : (
                <Button
                  title="Request unlock"
                  variant="secondary"
                  loading={unlockActionLoading}
                  onPress={handleRequestUnlock}
                  accessibilityLabel="Request unlock"
                />
              )
            ) : (
              <Button
                title="Lock my account"
                variant="destructive"
                onPress={handleLockAccount}
                accessibilityLabel="Lock my account"
              />
            )}
          </Card>

          {/* Daily Limit Card */}
          <Card style={styles.limitCard}>
            <View style={styles.cardHeader}>
              <View style={[groupedListStyles.disc, styles.headerDisc]}>
                <Sliders size={LIST_ICON_SIZE} color={colors.primary} />
              </View>
              <View style={styles.headerText}>
                <Text variant="title" color={colors.ink} accessibilityRole="header">
                  Daily transfer limit
                </Text>
                <Text variant="caption" color={colors.textSecondary}>
                  Applies to outgoing transfers and bill payments
                </Text>
              </View>
            </View>

            <View style={styles.limitAmountRow}>
              <AmountText
                amountCentavos={settings.daily_transfer_limit_centavos}
                hidden={hideBalance}
                variant="title"
                color={colors.ink}
                showSign={false}
              />
            </View>

            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.min(
                      100,
                      Math.max(
                        0,
                        settings.daily_transfer_limit_centavos > 0
                          ? (settings.spent_today_centavos /
                              settings.daily_transfer_limit_centavos) *
                              100
                          : 0
                      )
                    )}%`,
                    backgroundColor:
                      settings.remaining_today_centavos <= 0
                        ? colors.redText
                        : colors.primary,
                  },
                ]}
              />
            </View>

            <View style={styles.metrics}>
              <View style={styles.metricRow}>
                <Text variant="caption" color={colors.textSecondary}>
                  Spent today
                </Text>
                <AmountText
                  amountCentavos={settings.spent_today_centavos}
                  hidden={hideBalance}
                  variant="caption"
                  color={colors.textSecondary}
                  showSign={false}
                />
              </View>
              <View style={styles.metricRow}>
                <Text variant="caption" color={colors.textSecondary}>
                  Remaining today
                </Text>
                <AmountText
                  amountCentavos={settings.remaining_today_centavos}
                  hidden={hideBalance}
                  variant="caption"
                  color={
                    settings.remaining_today_centavos <= 0
                      ? colors.redText
                      : colors.textSecondary
                  }
                  showSign={false}
                />
              </View>
            </View>

            {isEditing ? (
              <View style={styles.editSection}>
                <AmountInput
                  value={newLimitStr}
                  onChangeText={(val) => {
                    setNewLimitStr(val);
                    setInputError(null);
                    setSaveError(null);
                  }}
                  error={inputError || undefined}
                  presetChips={LIMIT_PRESETS}
                />

                {saveError ? (
                  <View style={styles.errorBanner}>
                    <AlertCircle size={16} color={colors.redText} />
                    <Text
                      variant="caption"
                      color={colors.redText}
                      style={styles.errorText}
                    >
                      {saveError}
                    </Text>
                  </View>
                ) : null}

                <StepUpSetupLink error={saveError} onClose={() => setSaveError(null)} />

                <View style={styles.editButtons}>
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={cancelEditing}
                    disabled={saving}
                    style={styles.halfBtn}
                  />
                  <Button
                    title="Save limit"
                    variant="primary"
                    onPress={() => void guardSave(handleSaveLimit)}
                    loading={saving}
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

          {/* Security Timeline (§1.3) */}
          <View style={styles.section}>
            <Text variant="title" color={colors.ink} accessibilityRole="header">
              Security timeline
            </Text>
            {timeline.length === 0 ? (
              <EmptyState
                scrollable={false}
                title="No security events yet"
                description="Security events and alerts will appear here."
              />
            ) : (
              <GroupedList>
                {timeline.map((event, index) => {
                  const explanation =
                    event.explanation || bantayTemplate(event.kind, event.facts);
                  const title = bantayEventTitle(event.kind);
                  const time = formatEventTime(event.created_at);

                  return (
                    <React.Fragment key={event.id}>
                      {index > 0 ? <ListHairline /> : null}
                      <View style={styles.timelineRow}>
                        <View style={styles.timelineHeader}>
                          <View
                            style={[
                              groupedListStyles.disc,
                              event.severity === 'high'
                                ? styles.highSeverityDisc
                                : styles.headerDisc,
                            ]}
                          >
                            {renderTimelineIcon(event.kind)}
                          </View>
                          <View style={styles.timelineText}>
                            <Text variant="bodyStrong" color={colors.ink}>
                              {title}
                            </Text>
                            <Text variant="caption" color={colors.textSecondary}>
                              {explanation}
                            </Text>
                            {time ? (
                              <Text variant="caption" color={colors.textMuted}>
                                {time}
                              </Text>
                            ) : null}
                          </View>
                          {event.status === 'confirmed_me' ? (
                            <Badge label="Confirmed" variant="neutral" />
                          ) : event.status === 'reported_not_me' ? (
                            <Badge label="Reported" variant="danger" />
                          ) : null}
                        </View>

                        {event.status === 'open' ? (
                          <View style={styles.eventActions}>
                            <Button
                              title="This was me"
                              variant="secondary"
                              onPress={() =>
                                void handleMarkEvent(event.id, 'confirmed_me')
                              }
                              accessibilityLabel={`This was me, ${title}`}
                              style={styles.eventBtn}
                            />
                            <Button
                              title="Not me"
                              variant="destructive"
                              onPress={() => handleReportNotMe(event)}
                              accessibilityLabel={`Not me, ${title}`}
                              style={styles.eventBtn}
                            />
                          </View>
                        ) : null}
                      </View>
                    </React.Fragment>
                  );
                })}
              </GroupedList>
            )}
          </View>

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
      {confirmSheet}
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
  statusCard: {
    padding: spacing.lg,
    borderRadius: radius.md,
    gap: spacing.base,
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
  lockedDisc: {
    backgroundColor: colors.tintRed,
  },
  highSeverityDisc: {
    backgroundColor: colors.tintOrange,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  pendingLimitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
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
  offlineBanner: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    alignItems: 'center',
    marginBottom: spacing.xs,
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
  timelineRow: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  timelineText: {
    flex: 1,
    gap: spacing.xs,
  },
  eventActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    paddingLeft: LIST_ICON_SIZE + spacing.md,
  },
  eventBtn: {
    minHeight: 36,
  },
});
