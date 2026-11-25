import { useConfirmSheet } from '../hooks/useConfirmSheet';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { Send, Zap, CheckCircle2, XCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  colors,
  spacing,
  radius,
  formatCentavosToPHP,
  toUserMessage,
  type ScheduledPayment,
  type ScheduledPaymentRun,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { reportNetworkResult } from '../lib/networkStatus';
import { MASCOT_EMPTY, MASCOT_ERROR } from '../assets/illustrations';
import { useSettings } from '../context/SettingsContext';
import {
  FeatureScreen,
  Text,
  Button,
  Card,
  AmountText,
  Badge,
  EmptyState,
  Skeleton,
  Pressable,
  useToast,
} from '../components';

const SKELETON_CARDS = 3;
const SCHEDULE_CARD_SKELETON_HEIGHT = 76;

export function ScheduledPaymentsScreen() {
  const { showConfirmation, confirmSheet } = useConfirmSheet();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const toast = useToast();
  const { hideBalance, confirmBiometricPayment } = useSettings();

  const [schedules, setSchedules] = useState<ScheduledPayment[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduledPayment | null>(null);
  const [runs, setRuns] = useState<ScheduledPaymentRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadSchedules = useCallback(async () => {
    if (mountedRef.current) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const { data, error } = await supabase.rpc('list_my_scheduled_payments');

      reportNetworkResult(error);
      if (!mountedRef.current) return;
      if (error) {
        setLoadError(toUserMessage(error));
        setSchedules([]);
      } else if (data) {
        setSchedules(data as ScheduledPayment[]);
      }
    } catch (err: unknown) {
      reportNetworkResult(err);
      if (mountedRef.current) {
        setLoadError(toUserMessage(err));
        setSchedules([]);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const loadRuns = async (scheduleId: string) => {
    setRunsLoading(true);
    setRunsError(null);
    try {
      const { data, error } = await supabase
        .from('scheduled_payment_runs')
        .select('*')
        .eq('schedule_id', scheduleId)
        .order('created_at', { ascending: false });

      reportNetworkResult(error);
      if (!mountedRef.current) return;
      if (error) {
        setRunsError(toUserMessage(error));
        setRuns([]);
      } else if (data) {
        setRuns(data as ScheduledPaymentRun[]);
      }
    } catch (err: unknown) {
      reportNetworkResult(err);
      if (mountedRef.current) {
        setRunsError(toUserMessage(err));
        setRuns([]);
      }
    } finally {
      if (mountedRef.current) {
        setRunsLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  const handleSelectSchedule = (item: ScheduledPayment) => {
    setSelectedSchedule(item);
    loadRuns(item.id);
  };

  const handleCancelSchedule = () => {
    if (!selectedSchedule) return;

    showConfirmation({
      title: 'Cancel scheduled payment',
      message:
        'Are you sure you want to cancel this scheduled payment? Future executions will be stopped.',
      confirmLabel: 'Cancel payment',
      cancelLabel: 'Keep active',
      destructive: true,
      onConfirm: async () => {
        const authRes = await confirmBiometricPayment({
          title: 'Cancel Scheduled Payment',
          requireTotp: false,
          message: 'Confirm your identity to cancel this recurring payment schedule.',
        });
        if (!authRes.success) return;

        setActionLoading(true);
        try {
          const { error } = await supabase.rpc('cancel_scheduled_payment', {
            p_id: selectedSchedule.id,
            p_reason: 'Cancelled by customer',
          });

          if (error) {
            toast.show(toUserMessage(error), 'error');
          } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            toast.show('Scheduled payment cancelled');
            setSelectedSchedule(null);
            loadSchedules();
          }
        } catch (err: any) {
          toast.show(toUserMessage(err), 'error');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };
  return (
    <FeatureScreen
      title={selectedSchedule ? 'Schedule Details' : 'Scheduled Payments'}
      isProcessing={actionLoading}
      step={selectedSchedule ? 2 : 1}
      onPrevStep={() => setSelectedSchedule(null)}
    >
      <View style={styles.content}>
        {loadError ? (
          <EmptyState
            title="Scheduled payments unavailable"
            description={loadError}
            descriptionAccessibilityRole="alert"
            illustration={MASCOT_ERROR}
            illustrationTestID="schedules-error-mascot"
            actionTitle="Try again"
            onAction={() => void loadSchedules()}
            scrollable={false}
          />
        ) : selectedSchedule ? (
          // Detail View
          <View style={styles.detailContainer}>
            <Card style={styles.detailCard}>
              <View style={styles.detailAmountRow}>
                <Text variant="caption" color="textSecondary">
                  SCHEDULED AMOUNT
                </Text>
                <AmountText
                  amountCentavos={selectedSchedule.amount}
                  variant="display"
                  direction="outgoing"
                  hidden={hideBalance}
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.row}>
                <Text variant="body" color="textSecondary">
                  Status
                </Text>
                <Badge
                  variant={
                    selectedSchedule.status === 'active'
                      ? 'success'
                      : selectedSchedule.status === 'completed'
                        ? 'neutral'
                        : 'danger'
                  }
                  label={selectedSchedule.status.toUpperCase()}
                />
              </View>

              <View style={styles.row}>
                <Text variant="body" color="textSecondary">
                  Type
                </Text>
                <Text variant="bodyStrong">
                  {selectedSchedule.kind === 'bill' ? 'Bill Payment' : 'Funds Transfer'}
                </Text>
              </View>

              {selectedSchedule.kind === 'transfer' ? (
                <View style={styles.row}>
                  <Text variant="body" color="textSecondary">
                    Destination
                  </Text>
                  <Text variant="bodyStrong">
                    {selectedSchedule.to_account_number ||
                      (selectedSchedule.to_account_last4
                        ? `•••• ${selectedSchedule.to_account_last4}`
                        : selectedSchedule.to_account || '—')}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.row}>
                    <Text variant="body" color="textSecondary">
                      Biller
                    </Text>
                    <Text variant="bodyStrong">
                      {selectedSchedule.biller_name || 'Bill Payment'}
                    </Text>
                  </View>
                  {selectedSchedule.biller_reference ? (
                    <View style={styles.row}>
                      <Text variant="body" color="textSecondary">
                        Reference
                      </Text>
                      <Text variant="bodyStrong">
                        {selectedSchedule.biller_reference}
                      </Text>
                    </View>
                  ) : null}
                </>
              )}

              <View style={styles.row}>
                <Text variant="body" color="textSecondary">
                  Frequency
                </Text>
                <Text variant="bodyStrong" style={styles.capitalize}>
                  {selectedSchedule.frequency}
                </Text>
              </View>

              <View style={styles.row}>
                <Text variant="body" color="textSecondary">
                  Next Execution
                </Text>
                <Text variant="bodyStrong">{selectedSchedule.next_run_date}</Text>
              </View>

              <View style={styles.row}>
                <Text variant="body" color="textSecondary">
                  Runs Completed
                </Text>
                <Text variant="bodyStrong">
                  {selectedSchedule.runs_done}
                  {selectedSchedule.max_runs ? ` / ${selectedSchedule.max_runs}` : ''}
                </Text>
              </View>

              {selectedSchedule.end_date && (
                <View style={styles.row}>
                  <Text variant="body" color="textSecondary">
                    End Date
                  </Text>
                  <Text variant="bodyStrong">{selectedSchedule.end_date}</Text>
                </View>
              )}

              {selectedSchedule.note && (
                <View style={styles.row}>
                  <Text variant="body" color="textSecondary">
                    Note
                  </Text>
                  <Text variant="bodyStrong">{selectedSchedule.note}</Text>
                </View>
              )}
            </Card>

            {/* Run History List */}
            <View style={styles.runsSection}>
              <Text variant="label" style={styles.sectionTitle}>
                Execution History
              </Text>

              {runsLoading ? (
                <View style={styles.runsSkeleton} testID="schedule-runs-skeleton">
                  <Skeleton width="100%" height={56} style={styles.runSkeletonCard} />
                  <Skeleton width="100%" height={56} style={styles.runSkeletonCard} />
                </View>
              ) : runsError ? (
                <View style={styles.runsErrorBox}>
                  <Text
                    variant="caption"
                    color={colors.redText}
                    accessibilityRole="alert"
                  >
                    {runsError}
                  </Text>
                  <Button
                    title="Try again"
                    variant="secondary"
                    onPress={() => void loadRuns(selectedSchedule.id)}
                  />
                </View>
              ) : (
                runs.map((run) => (
                  <View key={run.id} style={styles.runRow}>
                    <View style={styles.runStatusIcon}>
                      {run.status === 'completed' ? (
                        <CheckCircle2 size={20} color={colors.primary} />
                      ) : (
                        <XCircle size={20} color={colors.redText} />
                      )}
                    </View>
                    <View style={styles.runTextContainer}>
                      <Text variant="bodyStrong">
                        {run.run_date} ·{' '}
                        {run.status === 'completed' ? 'Completed' : 'Failed'}
                      </Text>
                      {run.failure_reason && (
                        <Text variant="caption" color="redText">
                          {run.failure_reason}
                        </Text>
                      )}
                      {run.transaction_id && (
                        <Text variant="caption" color="textMuted">
                          Ref: {run.transaction_id.slice(0, 8)}...
                        </Text>
                      )}
                    </View>
                  </View>
                ))
              )}

              {!runsLoading && !runsError && runs.length === 0 && (
                <Text variant="caption" color="textMuted" style={styles.noRunsText}>
                  No executions recorded yet.
                </Text>
              )}
            </View>

            {selectedSchedule.status === 'active' && (
              <Button
                title="Cancel Schedule"
                variant="destructive"
                onPress={handleCancelSchedule}
                loading={actionLoading}
                style={styles.cancelButton}
              />
            )}
          </View>
        ) : (
          // List View
          <View style={styles.listContainer}>
            {loading ? (
              <View
                style={styles.listContainer}
                accessibilityRole="progressbar"
                accessibilityLabel="Loading scheduled payments"
                testID="schedules-skeleton"
              >
                {Array.from({ length: SKELETON_CARDS }, (_, index) => (
                  <Skeleton
                    key={index}
                    width="100%"
                    height={SCHEDULE_CARD_SKELETON_HEIGHT}
                    borderRadius={radius.md}
                  />
                ))}
              </View>
            ) : (
              <>
                {schedules.map((item) => (
                  <Pressable
                    key={item.id}
                    style={styles.scheduleCard}
                    onPress={() => handleSelectSchedule(item)}
                    feedbackType="scale"
                    accessibilityRole="button"
                    accessibilityLabel={`View schedule for ${formatCentavosToPHP(item.amount)}`}
                  >
                    <View style={styles.cardHeader}>
                      <View style={styles.iconCircle}>
                        {item.kind === 'bill' ? (
                          <Zap size={20} color={colors.yellow} />
                        ) : (
                          <Send size={20} color={colors.blue} />
                        )}
                      </View>

                      <View style={styles.cardHeaderInfo}>
                        <Text variant="bodyStrong">
                          {item.kind === 'bill'
                            ? item.biller_name || item.note || 'Bill Payment'
                            : `Transfer · •••• ${item.to_account_last4 || item.to_account_number?.slice(-4) || item.to_account?.slice(-4) || '••••'}`}
                        </Text>
                        <Text variant="caption" color="textSecondary">
                          Next: {item.next_run_date}
                        </Text>
                      </View>

                      <View style={styles.cardHeaderAmount}>
                        <AmountText
                          amountCentavos={item.amount}
                          variant="bodyStrong"
                          direction="outgoing"
                          hidden={hideBalance}
                        />
                        <Badge
                          variant={
                            item.status === 'active'
                              ? 'success'
                              : item.status === 'completed'
                                ? 'neutral'
                                : 'danger'
                          }
                          label={item.frequency}
                        />
                      </View>
                    </View>
                  </Pressable>
                ))}

                {schedules.length === 0 && (
                  <EmptyState
                    title="No scheduled payments"
                    description="Set up recurring transfers or bill payments to manage your finances automatically."
                    illustration={MASCOT_EMPTY}
                    illustrationTestID="schedules-empty-mascot"
                    actionTitle="Schedule a payment"
                    onAction={() => navigation.navigate('Transfer')}
                    scrollable={false}
                  />
                )}
              </>
            )}
          </View>
        )}
      </View>
      {confirmSheet}
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing['2xl'],
  },
  loadErrorContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.base,
  },
  loadErrorText: {
    textAlign: 'center',
  },
  listContainer: {
    gap: spacing.md,
  },
  scheduleCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cardHeaderInfo: {
    flex: 1,
  },
  cardHeaderAmount: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  detailContainer: {
    gap: spacing.base,
  },
  detailCard: {
    padding: spacing.base,
    gap: spacing.md,
  },
  detailAmountRow: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  capitalize: {
    textTransform: 'capitalize',
  },
  runsSection: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  runsSkeleton: {
    gap: spacing.sm,
  },
  runSkeletonCard: {
    borderRadius: radius.sm,
  },
  runsErrorBox: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  runRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  runStatusIcon: {
    marginRight: spacing.md,
  },
  runTextContainer: {
    flex: 1,
  },
  noRunsText: {
    padding: spacing.md,
    textAlign: 'center',
  },
  cancelButton: {
    marginTop: spacing.base,
  },
});
