import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import {
  CalendarClock,
  Send,
  Zap,
  Repeat,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowLeft,
  Trash2,
  Clock,
} from 'lucide-react-native';
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
import { useSettings } from '../context/SettingsContext';
import {
  BottomSheet,
  Text,
  Button,
  Card,
  AmountText,
  Badge,
  EmptyState,
} from '../components';

interface ScheduledPaymentsModalProps {
  visible: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export function ScheduledPaymentsModal({
  visible,
  onClose,
  onRefresh,
}: ScheduledPaymentsModalProps) {
  const { hideBalance, confirmBiometricPayment } = useSettings();

  const [schedules, setSchedules] = useState<ScheduledPayment[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduledPayment | null>(null);
  const [runs, setRuns] = useState<ScheduledPaymentRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_my_scheduled_payments');

      if (data && !error) {
        setSchedules(data as ScheduledPayment[]);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRuns = async (scheduleId: string) => {
    try {
      const { data, error } = await supabase
        .from('scheduled_payment_runs')
        .select('*')
        .eq('schedule_id', scheduleId)
        .order('created_at', { ascending: false });

      if (data && !error) {
        setRuns(data as ScheduledPaymentRun[]);
      }
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    if (visible) {
      loadSchedules();
      setSelectedSchedule(null);
      setRuns([]);
    }
  }, [visible, loadSchedules]);

  const handleSelectSchedule = (item: ScheduledPayment) => {
    setSelectedSchedule(item);
    loadRuns(item.id);
  };

  const handleCancelSchedule = () => {
    if (!selectedSchedule) return;

    Alert.alert(
      'Cancel Scheduled Payment',
      'Are you sure you want to cancel this scheduled payment? Future executions will be stopped.',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Cancel Payment',
          style: 'destructive',
          onPress: async () => {
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
                Alert.alert('Error', toUserMessage(error));
              } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setSelectedSchedule(null);
                loadSchedules();
                onRefresh?.();
              }
            } catch (err: any) {
              Alert.alert('Error', toUserMessage(err));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      dismissible={!actionLoading}
      title={selectedSchedule ? 'Schedule Details' : 'Scheduled Payments'}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {selectedSchedule ? (
          // Detail View
          <View style={styles.detailContainer}>
            <TouchableOpacity
              style={styles.backRow}
              onPress={() => setSelectedSchedule(null)}
            >
              <ArrowLeft size={18} color={colors.primary} />
              <Text variant="bodyStrong" color="primary">
                Back to All Schedules
              </Text>
            </TouchableOpacity>

            <Card style={styles.detailCard}>
              <View style={styles.detailAmountRow}>
                <Text variant="caption" color="textSecondary">
                  SCHEDULED AMOUNT
                </Text>
                <AmountText
                  amountCentavos={selectedSchedule.amount}
                  variant="display"
                  direction="outgoing"
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

              {runs.map((run) => (
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
              ))}

              {runs.length === 0 && (
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
            {schedules.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.scheduleCard}
                onPress={() => handleSelectSchedule(item)}
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
              </TouchableOpacity>
            ))}

            {schedules.length === 0 && !loading && (
              <EmptyState
                title="No scheduled payments"
                description="Set up recurring transfers or bill payments to manage your finances automatically."
              />
            )}
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing['2xl'],
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
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
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
