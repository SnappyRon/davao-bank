import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Zap, Send, ChevronRight } from 'lucide-react-native';
import { colors, radius, spacing, type ScheduledPayment } from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { AmountText } from '../../components/AmountText';
import { Pressable } from '../../components/Pressable';

interface HomeUpcomingPaymentsProps {
  schedules: ScheduledPayment[];
  onOpenSchedules: () => void;
}

export function HomeUpcomingPayments({
  schedules,
  onOpenSchedules,
}: HomeUpcomingPaymentsProps) {
  if (schedules.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text variant="h2">Upcoming Payments</Text>
        <Pressable
          onPress={onOpenSchedules}
          style={styles.seeAllButton}
          feedbackType="scale"
          accessibilityRole="button"
          accessibilityLabel="See all scheduled payments"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text variant="bodyStrong" color={colors.primary}>
            See all
          </Text>
          <ChevronRight size={16} color={colors.primary} />
        </Pressable>
      </View>
      {schedules.map((sched) => (
        <Pressable
          key={sched.id}
          style={styles.upcomingCard}
          onPress={onOpenSchedules}
          feedbackType="highlight"
          accessibilityRole="button"
          accessibilityLabel={`Scheduled payment: ${sched.note || (sched.kind === 'bill' ? 'Bill Payment' : 'Transfer')}, ${sched.next_run_date}`}
        >
          <View style={styles.upcomingIconCircle}>
            {sched.kind === 'bill' ? (
              <Zap size={18} color={colors.yellow} />
            ) : (
              <Send size={18} color={colors.blue} />
            )}
          </View>
          <View style={styles.upcomingInfo}>
            <Text variant="bodyStrong">
              {sched.note || (sched.kind === 'bill' ? 'Bill Payment' : 'Transfer')}
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              {sched.next_run_date} · {sched.frequency}
            </Text>
          </View>
          <AmountText
            amountCentavos={sched.amount}
            variant="bodyStrong"
            color={colors.ink}
            showSign={false}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.base,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  upcomingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  upcomingIconCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  upcomingInfo: {
    flex: 1,
  },
});
