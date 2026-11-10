import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Zap, Send, ChevronRight } from 'lucide-react-native';
import {
  colors,
  radius,
  size,
  spacing,
  type ScheduledPayment,
  type ScheduledPaymentFrequency,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { AmountText } from '../../components/AmountText';
import { Pressable } from '../../components/Pressable';
import { formatShortDate } from '../../components/CurrencyWatchCard';

/** Spec 7B.1: up to 3 rows in one grouped card; hairlines inset 72. */
const MAX_ROWS = 3;
const DISC_SIZE = 40;
const ICON_SIZE = 20;
const CHEVRON_SIZE = 16;
const ROW_MIN_HEIGHT = 64;
const HAIRLINE_INSET = spacing.base + DISC_SIZE + spacing.base;

const FREQUENCY_LABELS: Record<ScheduledPaymentFrequency, string> = {
  once: 'One time',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

interface HomeUpcomingPaymentsProps {
  schedules: ScheduledPayment[];
  hideBalance: boolean;
  onOpenSchedules: () => void;
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

export function HomeUpcomingPayments({
  schedules,
  hideBalance,
  onOpenSchedules,
}: HomeUpcomingPaymentsProps) {
  // Shown only when there are items.
  if (schedules.length === 0) return null;

  const rows = schedules.slice(0, MAX_ROWS);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="title" accessibilityRole="header">
          Coming up
        </Text>
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
      </View>

      <View style={styles.group}>
        {rows.map((sched, index) => {
          const title = scheduleTitle(sched);
          const meta = `${formatShortDate(sched.next_run_date)} · ${FREQUENCY_LABELS[sched.frequency] ?? sched.frequency}`;
          return (
            <Pressable
              key={sched.id}
              style={styles.row}
              onPress={onOpenSchedules}
              feedbackType="highlight"
              accessibilityRole="button"
              accessibilityLabel={`${title}, ${meta}`}
            >
              <View
                style={[
                  styles.disc,
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
              {index < rows.length - 1 ? <View style={styles.hairline} /> : null}
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
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    minHeight: ROW_MIN_HEIGHT,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  disc: {
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  hairline: {
    position: 'absolute',
    left: HAIRLINE_INSET,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
