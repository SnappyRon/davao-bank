import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Zap, Send, ChevronRight } from 'lucide-react-native';
import {
  colors,
  formatCentavosToPHP,
  size,
  spacing,
  type ScheduledPayment,
  type ScheduledPaymentFrequency,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { AmountText } from '../../components/AmountText';
import { Badge } from '../../components/Badge';
import { Pressable } from '../../components/Pressable';
import { formatShortDate } from '../../components/CurrencyWatchCard';
import { LIST_ICON_SIZE, groupedListStyles } from '../../components/GroupedList';
import type { BillReminder } from '../../hooks/usePhase8Contracts';

/** Spec 7B.1: up to 3 rows in one grouped card; hairlines inset 72 (shared metrics). */
const MAX_ROWS = 3;
const ICON_SIZE = LIST_ICON_SIZE;
const CHEVRON_SIZE = 16;

const FREQUENCY_LABELS: Record<ScheduledPaymentFrequency, string> = {
  once: 'One time',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

interface HomeUpcomingPaymentsProps {
  schedules: ScheduledPayment[];
  billReminders?: BillReminder[];
  hideBalance: boolean;
  onOpenSchedules: () => void;
  onOpenBillReminder?: (reminder: BillReminder) => void;
}

function scheduleTitle(sched: ScheduledPayment): string {
  if (sched.note) return sched.note;
  if (sched.kind === 'bill') return sched.biller_name || 'Bill payment';
  const last4 =
    sched.to_account_last4 ||
    sched.to_account_number?.slice(-4) ||
    sched.to_account?.slice(-4);
  return last4 ? `Transfer to •• ${last4}` : 'Transfer';
}

function formatDueInDays(days: number): string {
  if (days <= 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

export function HomeUpcomingPayments({
  schedules,
  billReminders = [],
  hideBalance,
  onOpenSchedules,
  onOpenBillReminder,
}: HomeUpcomingPaymentsProps) {
  // Shown only when there are items.
  if (schedules.length === 0 && billReminders.length === 0) return null;

  const scheduleRows = schedules.slice(0, MAX_ROWS);
  const reminderRows = billReminders.slice(0, MAX_ROWS);
  const totalRows = reminderRows.length + scheduleRows.length;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="title" accessibilityRole="header">
          Coming up
        </Text>
        {scheduleRows.length > 0 ? (
          <Pressable
            onPress={onOpenSchedules}
            style={styles.seeAllButton}
            feedbackType="scale"
            accessibilityRole="button"
            accessibilityLabel="See all scheduled payments"
          >
            <Text variant="label" color={colors.primary}>
              See all
            </Text>
            <ChevronRight size={CHEVRON_SIZE} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      <View style={groupedListStyles.group}>
        {reminderRows.map((reminder, index) => {
          const dueLabel = formatDueInDays(reminder.days_until_due);
          const meta = `${reminder.biller_name} · ${dueLabel}`;
          const rowIndex = index;
          return (
            <Pressable
              key={`rem-${reminder.id}`}
              style={groupedListStyles.row}
              onPress={() => onOpenBillReminder?.(reminder)}
              feedbackType="highlight"
              accessibilityRole="button"
              accessibilityLabel={`${reminder.nickname}, ${meta}, Bill due`}
            >
              <View
                style={[groupedListStyles.disc, { backgroundColor: colors.tintOrange }]}
              >
                <Zap size={ICON_SIZE} color={colors.orangeText} />
              </View>
              <View style={styles.rowText}>
                <Text variant="bodyStrong" color={colors.ink} numberOfLines={1}>
                  {reminder.nickname}
                </Text>
                <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
                  {meta}
                </Text>
              </View>
              <Badge label="Bill due" variant="warning" />
              {rowIndex < totalRows - 1 ? (
                <View style={groupedListStyles.hairlineAbsolute} />
              ) : null}
            </Pressable>
          );
        })}

        {scheduleRows.map((sched, index) => {
          const title = scheduleTitle(sched);
          const meta = `${formatShortDate(sched.next_run_date)} · ${FREQUENCY_LABELS[sched.frequency] ?? sched.frequency}`;
          const amountLabel = hideBalance
            ? 'amount hidden'
            : formatCentavosToPHP(sched.amount);
          const rowIndex = reminderRows.length + index;
          return (
            <Pressable
              key={sched.id}
              style={groupedListStyles.row}
              onPress={onOpenSchedules}
              feedbackType="highlight"
              accessibilityRole="button"
              accessibilityLabel={`${title}, ${meta}, ${amountLabel}`}
            >
              <View
                style={[
                  groupedListStyles.disc,
                  {
                    backgroundColor:
                      sched.kind === 'bill' ? colors.tintOrange : colors.tintBlue,
                  },
                ]}
              >
                {sched.kind === 'bill' ? (
                  <Zap size={ICON_SIZE} color={colors.orangeText} />
                ) : (
                  <Send size={ICON_SIZE} color={colors.blueText} />
                )}
              </View>
              <View style={styles.rowText}>
                <Text variant="bodyStrong" color={colors.ink} numberOfLines={1}>
                  {title}
                </Text>
                <Text variant="caption" color={colors.textMuted}>
                  {meta}
                </Text>
              </View>
              <AmountText
                amountCentavos={sched.amount}
                hidden={hideBalance}
                variant="bodyStrong"
                color={colors.ink}
                showSign={false}
                maxFontSizeMultiplier={1.4}
              />
              {rowIndex < totalRows - 1 ? (
                <View style={groupedListStyles.hairlineAbsolute} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  seeAllButton: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowText: {
    flex: 1,
  },
});
