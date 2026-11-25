import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { colors, size, spacing, type TransactionHistoryItem } from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { TransactionRow } from '../../components/TransactionRow';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { Pressable } from '../../components/Pressable';
import { Button } from '../../components/Button';
import {
  GroupedList,
  ListHairline,
  LIST_ROW_MIN_HEIGHT,
  groupedListStyles,
} from '../../components/GroupedList';
import {
  buildReversalOriginals,
  reversalOriginalFor,
} from '../../utils/transactionDisplay';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const duriEmptyIllustration = require('../../../assets/illustrations/duri-empty-state.png');

/** Spec 7B.1: one grouped card with 5 rows; hairlines inset 72 (shared metrics). */
const MAX_ROWS = 5;
const SKELETON_ROWS = 3;
const CHEVRON_SIZE = 16;

interface HomeRecentActivityProps {
  loading: boolean;
  /** User-facing message (already mapped by `toUserMessage`) when the load failed. */
  error: string | null;
  onRetry: () => void;
  transactions: TransactionHistoryItem[];
  onNavigateToActivity?: () => void;
  onSelectTransaction: (tx: TransactionHistoryItem) => void;
}

export function HomeRecentActivity({
  loading,
  error,
  onRetry,
  transactions,
  onNavigateToActivity,
  onSelectTransaction,
}: HomeRecentActivityProps) {
  const rows = transactions.slice(0, MAX_ROWS);
  // Reversal titles look up the original among everything loaded, not only
  // the 5 rows shown.
  const originals = useMemo(() => buildReversalOriginals(transactions), [transactions]);

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
        <View style={[groupedListStyles.group, styles.errorBox]}>
          <Text variant="bodyStrong" color={colors.ink}>
            Activity unavailable
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            {error}
          </Text>
          <Button title="Try again" variant="secondary" onPress={onRetry} />
        </View>
      ) : loading ? (
        <GroupedList>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Skeleton
              key={index}
              width="100%"
              height={LIST_ROW_MIN_HEIGHT}
              style={styles.rowSkeleton}
            />
          ))}
        </GroupedList>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Money you send, receive and pay will show here."
          illustration={duriEmptyIllustration}
          scrollable={false}
        />
      ) : (
        <GroupedList>
          {rows.map((item, index) => (
            <View key={item.ledger_entry_id || item.transaction_id}>
              <TransactionRow
                transaction={item}
                reversalOf={reversalOriginalFor(item, originals)}
                onPress={() => onSelectTransaction(item)}
              />
              {index < rows.length - 1 ? <ListHairline /> : null}
            </View>
          ))}
        </GroupedList>
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
  errorBox: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  rowSkeleton: {
    borderRadius: 0,
  },
});
