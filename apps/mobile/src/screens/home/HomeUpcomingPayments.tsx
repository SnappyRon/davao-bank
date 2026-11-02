import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Zap, Send, ChevronRight } from 'lucide-react-native';
import { colors, radius, spacing, type ScheduledPayment } from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { AmountText } from '../../components/AmountText';

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
        <TouchableOpacity
          onPress={onOpenSchedules}
          style={styles.seeAllButton}
          activeOpacity={0.7}
        >
          <Text variant="bodyStrong" color={colors.primary}>
            See all
          </Text>
          <ChevronRight size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>
      {schedules.map((sched) => (
        <TouchableOpacity
          key={sched.id}
          style={styles.upcomingCard}
          onPress={onOpenSchedules}
          activeOpacity={0.7}
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
        </TouchableOpacity>
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
