import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  SectionList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { FileText, SlidersHorizontal } from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  fetchTransactionHistory,
  type TransactionHistoryItem,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import {
  Screen,
  Text,
  FilterChips,
  TransactionRow,
  EmptyState,
  Skeleton,
} from '../components';
import { TransactionDetailModal } from './TransactionDetailModal';

export type ActivityFilter =
  'all' | 'transfer' | 'deposit' | 'withdrawal' | 'adjustment' | 'reversal';

interface ActivityScreenProps {
  onExportStatement?: () => void;
}

export function ActivityScreen({ onExportStatement }: ActivityScreenProps) {
  const [transactions, setTransactions] = useState<TransactionHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<ActivityFilter>('all');
  const [selectedTx, setSelectedTx] = useState<TransactionHistoryItem | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const { data, error } = await fetchTransactionHistory(supabase);
      if (!error && data) {
        setTransactions(data);
      }
    } catch (err) {
      console.warn('Failed to fetch activity history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    loadHistory();
  };

  const filterOptions = [
    { label: 'All', value: 'all' },
    { label: 'Transfers', value: 'transfer' },
    { label: 'Cash-in', value: 'deposit' },
    { label: 'Cash-out', value: 'withdrawal' },
    { label: 'Adjustments', value: 'adjustment' },
    { label: 'Reversals', value: 'reversal' },
  ];

  const filteredTransactions = useMemo(() => {
    if (selectedFilter === 'all') return transactions;
    return transactions.filter((t) => t.type === selectedFilter);
  }, [transactions, selectedFilter]);

  // Group transactions by date: Today, Yesterday, or formatted date string
  const groupedSections = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: { [key: string]: TransactionHistoryItem[] } = {};

    filteredTransactions.forEach((tx) => {
      const txDate = new Date(tx.created_at);
      const txDay = new Date(txDate);
      txDay.setHours(0, 0, 0, 0);

      let header = '';
      if (txDay.getTime() === today.getTime()) {
        header = 'Today';
      } else if (txDay.getTime() === yesterday.getTime()) {
        header = 'Yesterday';
      } else {
        header = txDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }

      if (!groups[header]) {
        groups[header] = [];
      }
      groups[header].push(tx);
    });

    return Object.keys(groups).map((title) => ({
      title,
      data: groups[title],
    }));
  }, [filteredTransactions]);

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text variant="h1">Activity</Text>
          {onExportStatement ? (
            <TouchableOpacity
              onPress={onExportStatement}
              style={styles.exportButton}
              activeOpacity={0.8}
            >
              <FileText size={18} color={colors.primary} />
              <Text variant="bodyStrong" color={colors.primary}>
                Statement
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <FilterChips
          options={filterOptions}
          selectedValue={selectedFilter}
          onSelect={(val) => setSelectedFilter(val as ActivityFilter)}
        />
      </View>

      {loading ? (
        <View style={styles.skeletonContainer}>
          <Skeleton width="100%" height={68} style={styles.skeletonItem} />
          <Skeleton width="100%" height={68} style={styles.skeletonItem} />
          <Skeleton width="100%" height={68} style={styles.skeletonItem} />
          <Skeleton width="100%" height={68} style={styles.skeletonItem} />
        </View>
      ) : groupedSections.length === 0 ? (
        <EmptyState
          title="No transactions yet"
          description={
            selectedFilter === 'all'
              ? 'Your completed money operations and ledger activity will appear here.'
              : `No activity found under ${selectedFilter}.`
          }
          icon={<SlidersHorizontal size={36} color={colors.textMuted} />}
          style={styles.emptyContainer}
        />
      ) : (
        <SectionList
          sections={groupedSections}
          keyExtractor={(item) => item.ledger_entry_id || item.transaction_id}
          renderItem={({ item }) => (
            <View style={styles.rowWrapper}>
              <TransactionRow transaction={item} onPress={() => setSelectedTx(item)} />
            </View>
          )}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeader}>
              <Text
                variant="caption"
                color={colors.textSecondary}
                style={styles.sectionHeaderText}
              >
                {title.toUpperCase()}
              </Text>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}

      {selectedTx ? (
        <TransactionDetailModal
          visible={Boolean(selectedTx)}
          transaction={selectedTx}
          onClose={() => setSelectedTx(null)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.canvas,
  },
  header: {
    paddingHorizontal: spacing.screenSide,
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
  },
  listContent: {
    paddingHorizontal: spacing.screenSide,
    paddingBottom: spacing['3xl'],
  },
  sectionHeader: {
    paddingTop: spacing.base,
    paddingBottom: spacing.xs,
    backgroundColor: colors.canvas,
  },
  sectionHeaderText: {
    letterSpacing: 0.5,
  },
  rowWrapper: {
    marginVertical: 4,
  },
  skeletonContainer: {
    padding: spacing.screenSide,
    gap: spacing.md,
  },
  skeletonItem: {
    borderRadius: radius.md,
  },
  emptyContainer: {
    marginTop: spacing['3xl'],
    paddingHorizontal: spacing.screenSide,
  },
});
