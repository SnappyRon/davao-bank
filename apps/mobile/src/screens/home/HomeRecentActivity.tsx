import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { colors, radius, spacing, type TransactionHistoryItem } from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { TransactionRow } from '../../components/TransactionRow';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';

interface HomeRecentActivityProps {
  loading: boolean;
  transactions: TransactionHistoryItem[];
  hideBalance: boolean;
  onNavigateToActivity?: () => void;
  onSelectTransaction: (tx: TransactionHistoryItem) => void;
}

export function HomeRecentActivity({
  loading,
  transactions,
  hideBalance,
  onNavigateToActivity,
  onSelectTransaction,
}: HomeRecentActivityProps) {
  return (
    <>
      <View style={styles.sectionHeader}>
        <Text variant="h2">Recent Activity</Text>
        {transactions.length > 0 && onNavigateToActivity ? (
          <TouchableOpacity
            onPress={onNavigateToActivity}
            style={styles.seeAllButton}
            activeOpacity={0.7}
          >
            <Text variant="bodyStrong" color={colors.primary}>
              See all
            </Text>
            <ChevronRight size={16} color={colors.primary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.activitySkeletonContainer}>
          <Skeleton width="100%" height={68} style={styles.txSkeleton} />
          <Skeleton width="100%" height={68} style={styles.txSkeleton} />
          <Skeleton width="100%" height={68} style={styles.txSkeleton} />
        </View>
      ) : transactions.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Your recent deposits, transfers, and withdrawals will appear here."
          style={styles.emptyActivity}
        />
      ) : (
        <View style={styles.txList}>
          {transactions.slice(0, 5).map((item) => (
            <TransactionRow
              key={item.ledger_entry_id || item.transaction_id}
              transaction={item}
              hideBalance={hideBalance}
              onPress={() => onSelectTransaction(item)}
            />
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
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
  activitySkeletonContainer: {
    gap: spacing.sm,
  },
  txSkeleton: {
    borderRadius: radius.md,
  },
  emptyActivity: {
    paddingVertical: spacing['2xl'],
  },
  txList: {
    gap: spacing.sm,
  },
});
