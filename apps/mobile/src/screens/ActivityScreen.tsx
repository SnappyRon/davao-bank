import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileText, Search } from 'lucide-react-native';
import {
  colors,
  size,
  spacing,
  typography,
  fetchAccountBalances,
  fetchTransactionHistory,
  toUserMessage,
  type AccountBalance,
  type TransactionHistoryItem,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { reportNetworkResult } from '../lib/networkStatus';
import {
  Screen,
  Text,
  TextField,
  FilterChips,
  TransactionRow,
  EmptyState,
  Skeleton,
  Pressable,
  GroupedList,
  ListHairline,
  LIST_ROW_MIN_HEIGHT,
  formatAccountLabel,
  tabScreenBottomClearance,
} from '../components';
import {
  buildReversalOriginals,
  hidesCounterparty,
  reversalOriginalFor,
  transactionNote,
} from '../utils/transactionDisplay';

export type ActivityFilter =
  | 'all'
  | 'transfer'
  | 'deposit'
  | 'withdrawal'
  | 'adjustment'
  | 'reversal'
  | 'bill_payment';

const ALL_ACCOUNTS = 'all';
const SKELETON_ROWS = 4;
const HEADER_ICON_SIZE = 18;
const SEARCH_ICON_SIZE = 18;

const TYPE_FILTERS: { label: string; value: ActivityFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Transfers', value: 'transfer' },
  { label: 'Bills', value: 'bill_payment' },
  { label: 'Add money', value: 'deposit' },
  { label: 'Cash out', value: 'withdrawal' },
  { label: 'Bank credits & debits', value: 'adjustment' },
  { label: 'Reversals', value: 'reversal' },
];

/** Filtered empty copy (Wording table: "No bill payments yet."). */
const FILTERED_EMPTY: Record<Exclude<ActivityFilter, 'all'>, string> = {
  transfer: 'No transfers yet.',
  bill_payment: 'No bill payments yet.',
  deposit: 'No money added yet.',
  withdrawal: 'No cash outs yet.',
  adjustment: 'No bank credits or debits yet.',
  reversal: 'No reversals yet.',
};

/** Type only ("Savings"), used in front of the row meta on Activity. */
function accountTypeLabel(account: AccountBalance): string {
  const label = formatAccountLabel(account);
  return label.split(' •• ')[0];
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Search by note or counterparty account (client-side, over loaded items). */
export function matchesActivitySearch(item: TransactionHistoryItem, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const note = transactionNote(item)?.toLowerCase() ?? '';
  if (note.includes(q)) return true;
  // Account search only for number-like queries ("7943", "•• 7943") or at
  // least 3 digits, so text like "rent 2" doesn't match account digits.
  const qDigits = digitsOnly(q);
  const numberLike = /^[\d•\s]+$/.test(q) || qDigits.length >= 3;
  if (
    numberLike &&
    qDigits &&
    item.counterparty_account_number &&
    !hidesCounterparty(item)
  ) {
    return item.counterparty_account_number.includes(qDigits);
  }
  return false;
}

interface ActivitySection {
  title: string;
  data: TransactionHistoryItem[];
}

function sectionTitle(iso: string, today: Date, yesterday: Date): string {
  const txDate = new Date(iso);
  const txDay = new Date(txDate);
  txDay.setHours(0, 0, 0, 0);
  if (txDay.getTime() === today.getTime()) return 'Today';
  if (txDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return txDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/* eslint-disable @typescript-eslint/no-require-imports */
const duriEmptyIllustration = require('../../assets/illustrations/duri-empty-state.png');
const duriErrorIllustration = require('../../assets/illustrations/duri-error-state.png');
/* eslint-enable @typescript-eslint/no-require-imports */

export function ActivityScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const [transactions, setTransactions] = useState<TransactionHistoryItem[]>([]);
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<ActivityFilter>('all');
  const [selectedAccount, setSelectedAccount] = useState<string>(ALL_ACCOUNTS);
  const [query, setQuery] = useState('');
  const loadIdRef = useRef(0);

  const loadHistory = useCallback(async () => {
    const loadId = ++loadIdRef.current;
    try {
      const [txRes, accRes] = await Promise.all([
        fetchTransactionHistory(supabase),
        fetchAccountBalances(supabase),
      ]);
      if (loadId !== loadIdRef.current) return;
      reportNetworkResult(txRes.error || accRes.error);
      if (txRes.error || !txRes.data) {
        setError(toUserMessage(txRes.error ?? 'Activity could not be loaded.', 'load'));
      } else {
        setError(null);
        setTransactions(txRes.data);
        setLoaded(true);
      }
      // Accounts only add the prefix and the filter. A failed account load
      // keeps the accounts we already had.
      if (!accRes.error && accRes.data) setAccounts(accRes.data);
    } catch (err) {
      reportNetworkResult(err);
      if (loadId !== loadIdRef.current) return;
      setError(toUserMessage(err, 'load'));
    } finally {
      if (loadId === loadIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Loads on first focus and refreshes whenever the tab regains focus.
  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, [loadHistory])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void loadHistory();
  };

  const retry = () => {
    setLoading(true);
    void loadHistory();
  };

  // The account filter falls back to "All accounts" when the chosen account
  // disappears or only one account remains (the chips are hidden then).
  useEffect(() => {
    if (selectedAccount === ALL_ACCOUNTS) return;
    if (
      accounts.length <= 1 ||
      !accounts.some((account) => account.account_id === selectedAccount)
    ) {
      setSelectedAccount(ALL_ACCOUNTS);
    }
  }, [accounts, selectedAccount]);

  const accountLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accounts)
      map.set(account.account_id, accountTypeLabel(account));
    return map;
  }, [accounts]);

  const accountOptions = useMemo(
    () => [
      { label: 'All accounts', value: ALL_ACCOUNTS },
      ...accounts.map((account) => ({
        label: formatAccountLabel(account),
        value: account.account_id,
      })),
    ],
    [accounts]
  );

  const originals = useMemo(() => buildReversalOriginals(transactions), [transactions]);

  const filteredTransactions = useMemo(
    () =>
      transactions.filter(
        (t) =>
          (selectedFilter === 'all' || t.type === selectedFilter) &&
          (selectedAccount === ALL_ACCOUNTS || t.account_id === selectedAccount) &&
          matchesActivitySearch(t, query)
      ),
    [transactions, selectedFilter, selectedAccount, query]
  );

  // Group by day: Today, Yesterday, or a date. One grouped card per section.
  const sections = useMemo<ActivitySection[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const order: string[] = [];
    const groups: Record<string, TransactionHistoryItem[]> = {};
    for (const tx of filteredTransactions) {
      const title = sectionTitle(tx.created_at, today, yesterday);
      if (!groups[title]) {
        groups[title] = [];
        order.push(title);
      }
      groups[title].push(tx);
    }
    return order.map((title) => ({ title, data: groups[title] }));
  }, [filteredTransactions]);

  const bottomClearance = tabScreenBottomClearance(insets.bottom);
  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.primary}
    />
  );

  const emptyState = (() => {
    if (query.trim()) {
      return {
        title: 'No matches',
        description: 'Try another note or account number.',
        illustration: duriErrorIllustration,
        illustrationTestID: 'activity-no-matches-mascot',
        actionTitle: 'Clear search',
        onAction: () => setQuery(''),
      };
    }
    if (selectedFilter !== 'all') {
      return {
        title: 'Nothing here yet',
        description: FILTERED_EMPTY[selectedFilter],
        illustration: duriEmptyIllustration,
        illustrationTestID: 'activity-empty-mascot',
        actionTitle: 'Show all activity',
        onAction: () => setSelectedFilter('all'),
      };
    }
    if (selectedAccount !== ALL_ACCOUNTS) {
      const label =
        accountOptions.find((o) => o.value === selectedAccount)?.label ?? 'this account';
      return {
        title: 'No activity yet',
        description: `No activity on ${label} yet.`,
        illustration: duriEmptyIllustration,
        illustrationTestID: 'activity-empty-mascot',
        actionTitle: 'Show all accounts',
        onAction: () => setSelectedAccount(ALL_ACCOUNTS),
      };
    }
    return {
      title: 'No activity yet',
      description: 'Money you send, receive and pay will show here.',
      illustration: duriEmptyIllustration,
      illustrationTestID: 'activity-empty-mascot',
      actionTitle: 'Send money',
      onAction: () => navigation.navigate('Transfer'),
    };
  })();

  // Shown when a refresh fails after rows have loaded (above the rows, or
  // above the empty state when the filtered list is empty).
  const inlineError = error ? (
    <View style={styles.inlineError}>
      <Text
        variant="caption"
        color={colors.redText}
        accessibilityRole="alert"
        style={styles.inlineErrorText}
      >
        {error}
      </Text>
      <Pressable
        onPress={retry}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        style={styles.inlineRetry}
      >
        <Text variant="label" color={colors.primary}>
          Try again
        </Text>
      </Pressable>
    </View>
  ) : null;

  const renderBody = () => {
    if (loading) {
      return (
        <View style={styles.listPadding}>
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
        </View>
      );
    }

    // A failed load never looks like an empty list. Rows already loaded stay
    // visible on a failed refresh, with the error above them.
    if (error && !loaded) {
      return (
        <EmptyState
          title="Activity unavailable"
          description={error}
          descriptionAccessibilityRole="alert"
          illustration={duriErrorIllustration}
          illustrationTestID="activity-error-mascot"
          actionTitle="Try again"
          onAction={retry}
          refreshControl={refreshControl}
          style={{ paddingBottom: bottomClearance }}
        />
      );
    }

    if (sections.length === 0) {
      return (
        <View style={styles.flex}>
          {inlineError ? <View style={styles.listPadding}>{inlineError}</View> : null}
          <EmptyState
            title={emptyState.title}
            description={emptyState.description}
            illustration={emptyState.illustration}
            illustrationTestID={emptyState.illustrationTestID}
            actionTitle={emptyState.actionTitle}
            onAction={emptyState.onAction}
            refreshControl={refreshControl}
            style={{ paddingBottom: bottomClearance }}
          />
        </View>
      );
    }

    return (
      <FlatList
        data={sections}
        keyExtractor={(section) => section.title}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomClearance }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        ListHeaderComponent={inlineError ?? undefined}
        renderItem={({ item: section }) => (
          <View style={styles.section}>
            <Text
              variant="caption"
              color={colors.textSecondary}
              accessibilityRole="header"
              style={styles.sectionHeaderText}
            >
              {section.title.toLocaleUpperCase('en-US')}
            </Text>
            <GroupedList>
              {section.data.map((item, index) => (
                <View key={item.ledger_entry_id || item.transaction_id}>
                  <TransactionRow
                    transaction={item}
                    reversalOf={reversalOriginalFor(item, originals)}
                    accountLabel={accountLabels.get(item.account_id)}
                    onPress={() =>
                      navigation.navigate('Receipt', {
                        transactionId: item.transaction_id,
                        accountId: item.account_id,
                      })
                    }
                  />
                  {index < section.data.length - 1 ? <ListHairline /> : null}
                </View>
              ))}
            </GroupedList>
          </View>
        )}
      />
    );
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text variant="h1" accessibilityRole="header">
            Activity
          </Text>
          <Pressable
            onPress={() => navigation.navigate('ExportStatement')}
            style={styles.exportButton}
            feedbackType="scale"
            accessibilityRole="button"
            accessibilityLabel="Export statement"
          >
            <FileText size={HEADER_ICON_SIZE} color={colors.primary} />
            <Text variant="label" color={colors.primary}>
              Statement
            </Text>
          </Pressable>
        </View>

        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search by note or account"
          accessibilityLabel="Search activity"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          leftElement={<Search size={SEARCH_ICON_SIZE} color={colors.textMuted} />}
        />

        <View style={styles.filters}>
          <FilterChips
            options={TYPE_FILTERS}
            selectedValue={selectedFilter}
            onSelect={(val) => setSelectedFilter(val as ActivityFilter)}
          />
          {accounts.length > 1 ? (
            <FilterChips
              options={accountOptions}
              selectedValue={selectedAccount}
              onSelect={(val) => setSelectedAccount(val)}
            />
          ) : null}
        </View>
      </View>

      {renderBody()}
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
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exportButton: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  filters: {
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  listPadding: {
    paddingHorizontal: spacing.screenSide,
  },
  listContent: {
    paddingHorizontal: spacing.screenSide,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeaderText: {
    letterSpacing: typography.caption.letterSpacing,
  },
  rowSkeleton: {
    borderRadius: 0,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inlineErrorText: {
    flex: 1,
  },
  inlineRetry: {
    minHeight: size.touch,
    justifyContent: 'center',
  },
});
