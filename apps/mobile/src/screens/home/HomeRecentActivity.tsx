import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import {
  colors,
  radius,
  size,
  spacing,
  type TransactionHistoryItem,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { TransactionRow } from '../../components/TransactionRow';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { Pressable } from '../../components/Pressable';
import { Button } from '../../components/Button';

/** Spec 7B.1: one grouped card with 5 rows; hairlines inset 72. */
const MAX_ROWS = 5;
const SKELETON_ROWS = 3;
const ROW_SKELETON_HEIGHT = 64;
const CHEVRON_SIZE = 16;
const HAIRLINE_INSET = 72;

interface HomeRecentActivityProps {
  loading: boolean;
  /** User-facing message (already mapped by `toUserMessage`) when the load failed. */
  error: string | null;
  onRetry: () => void;
  transactions: TransactionHistoryItem[];
  hideBalance: boolean;
  onNavigateToActivity?: () => void;
  onSelectTransaction: (tx: TransactionHistoryItem) => void;
}

export function HomeRecentActivity({
  loading,
  error,
  onRetry,
  transactions,
  hideBalance,
  onNavigateToActivity,
  onSelectTransaction,
}: HomeRecentActivityProps) {
  const rows = transactions.slice(0, MAX_ROWS);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="title" accessibilityRole="header">
          Recent activity
        </Text>
        {transactions.length > 0 && onNavigateToActivity ? (
          <Pressable
            onPress={onNavigateToActivity}
            style={styles.seeAllButton}
            feedbackType="scale"
            accessibilityRole="button"
            accessibilityLabel="See all activity"
          >
            <Text variant="label" color={colors.primary}>
              See all
            </Text>
            <ChevronRight size={CHEVRON_SIZE} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      {error && !loading ? (
        <View style={[styles.group, styles.errorBox]}>
          <Text variant="bodyStrong" color={colors.ink}>
            Activity unavailable
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            {error}
          </Text>
          <Button title="Try again" variant="secondary" onPress={onRetry} />
        </View>
      ) : loading ? (
        <View style={styles.group}>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Skeleton
              key={index}
              width="100%"
              height={ROW_SKELETON_HEIGHT}
              style={styles.rowSkeleton}
            />
          ))}
        </View>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Money you send, receive and pay will show here."
          scrollable={false}
        />
      ) : (
        <View style={styles.group}>
          {rows.map((item, index) => (
            <View key={item.ledger_entry_id || item.transaction_id}>
              <TransactionRow
                transaction={item}
                hideBalance={hideBalance}
                onPress={() => onSelectTransaction(item)}
                style={styles.groupedRow}
              />
              {index < rows.length - 1 ? <View style={styles.hairline} /> : null}
            </View>
          ))}
        </View>
      )}
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
  errorBox: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  // The row keeps its own layout (restyled in 7B.2); inside the grouped card
  // it drops its per-row border and radius.
  groupedRow: {
    borderWidth: 0,
    borderRadius: 0,
  },
  rowSkeleton: {
    borderRadius: 0,
  },
  hairline: {
    marginLeft: HAIRLINE_INSET,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
