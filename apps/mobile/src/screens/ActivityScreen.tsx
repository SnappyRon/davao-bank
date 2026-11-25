import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, BottomTabParamList } from '../../App';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BarChart3,
  FileText,
  Search,
  SlidersHorizontal,
  Wallet,
  ChevronDown,
  X,
} from 'lucide-react-native';
import {
  colors,
  radius,
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
import { useSettings } from '../context/SettingsContext';
import {
  Screen,
  Text,
  TextField,
  TransactionRow,
  EmptyState,
  Skeleton,
  Pressable,
  GroupedList,
  ListHairline,
  LIST_ROW_MIN_HEIGHT,
  formatAccountLabel,
  AccountPickerSheet,
  ActivityFilterSheet,
  DEFAULT_ACTIVITY_FILTERS,
  countActiveFilters,
  matchesDateRange,
  type ActivityFilterState,
  type DateRangePreset,
  type ActivityDirection,
  type ActivityStatus,
  TYPE_OPTIONS,
  DATE_PRESET_OPTIONS,
  STATUS_OPTIONS,
  tabScreenBottomClearance,
  CHIP_MIN_HEIGHT,
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

function getTypeLabel(typeVal: string): string {
  const opt = TYPE_OPTIONS.find((o) => o.value === typeVal);
  return opt ? opt.label : typeVal;
}

function getDatePresetLabel(preset: DateRangePreset): string {
  const opt = DATE_PRESET_OPTIONS.find((o) => o.value === preset);
  return opt ? opt.label : preset;
}

function getDirectionLabel(dir: ActivityDirection): string {
  if (dir === 'in') return 'Money in';
  if (dir === 'out') return 'Money out';
  return 'All directions';
}

function getStatusLabel(st: ActivityStatus): string {
  const opt = STATUS_OPTIONS.find((o) => o.value === st);
  return opt ? opt.label : st;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const duriEmptyIllustration = require('../../assets/illustrations/duri-empty-state.png');
const duriErrorIllustration = require('../../assets/illustrations/duri-error-state.png');
/* eslint-enable @typescript-eslint/no-require-imports */

export function ActivityScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabNavigation =
    useNavigation<BottomTabNavigationProp<BottomTabParamList, 'ActivityTab'>>();
  const route = useRoute<RouteProp<BottomTabParamList, 'ActivityTab'>>();
  const insets = useSafeAreaInsets();
  const { hideBalance } = useSettings();

  const [transactions, setTransactions] = useState<TransactionHistoryItem[]>([]);
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedAccount, setSelectedAccount] = useState<string>(ALL_ACCOUNTS);
  const [filters, setFilters] = useState<ActivityFilterState>(DEFAULT_ACTIVITY_FILTERS);
  const [query, setQuery] = useState('');

  const [accountPickerVisible, setAccountPickerVisible] = useState(false);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

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

  // "See all" from Account detail opens this tab with an account to filter by.
  // Apply it once, then clear it so a later visit with the same account applies again.
  const routeAccountId = route?.params?.accountId;
  const tabNavigationRef = useRef(tabNavigation);
  tabNavigationRef.current = tabNavigation;
  useEffect(() => {
    if (!routeAccountId) return;
    setSelectedAccount(routeAccountId);
    tabNavigationRef.current.setParams({ accountId: undefined });
  }, [routeAccountId]);

  useEffect(() => {
    if (selectedAccount === ALL_ACCOUNTS) return;
    // Accounts are still loading: keep a requested account until we can check it.
    if (accounts.length === 0) return;
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

  const currentAccountLabel = useMemo(() => {
    if (selectedAccount === ALL_ACCOUNTS) return 'All accounts';
    const acc = accounts.find((a) => a.account_id === selectedAccount);
    return acc ? formatAccountLabel(acc) : 'Account';
  }, [accounts, selectedAccount]);

  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);
  const hasActiveFilters = activeFilterCount > 0 || selectedAccount !== ALL_ACCOUNTS;

  const clearAllFilters = useCallback(() => {
    setFilters(DEFAULT_ACTIVITY_FILTERS);
    setSelectedAccount(ALL_ACCOUNTS);
    setQuery('');
  }, []);

  const removeTypeFilter = (typeVal: string) => {
    setFilters((prev) => ({
      ...prev,
      types: prev.types.filter((t) => t !== typeVal),
    }));
  };

  const removeDateFilter = () => {
    setFilters((prev) => ({
      ...prev,
      datePreset: 'all',
      customStartDate: null,
      customEndDate: null,
    }));
  };

  const removeDirectionFilter = () => {
    setFilters((prev) => ({ ...prev, direction: 'all' }));
  };

  const removeStatusFilter = () => {
    setFilters((prev) => ({ ...prev, status: 'all' }));
  };

  const originals = useMemo(() => buildReversalOriginals(transactions), [transactions]);

  const filteredTransactions = useMemo(
    () =>
      transactions.filter(
        (t) =>
          (selectedAccount === ALL_ACCOUNTS || t.account_id === selectedAccount) &&
          (filters.types.length === 0 || filters.types.includes(t.type)) &&
          matchesDateRange(
            t.created_at,
            filters.datePreset,
            filters.customStartDate,
            filters.customEndDate
          ) &&
          (filters.direction === 'all' ||
            (filters.direction === 'in'
              ? t.direction === 'credit'
              : t.direction === 'debit')) &&
          (filters.status === 'all' || t.status === filters.status) &&
          matchesActivitySearch(t, query)
      ),
    [transactions, selectedAccount, filters, query]
  );

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
    if (
      filters.types.length === 1 &&
      activeFilterCount === 1 &&
      selectedAccount === ALL_ACCOUNTS
    ) {
      const singleType = filters.types[0];
      return {
        title: 'Nothing here yet',
        description:
          FILTERED_EMPTY[singleType as Exclude<ActivityFilter, 'all'>] ??
          'No activity found for this filter.',
        illustration: duriEmptyIllustration,
        illustrationTestID: 'activity-empty-mascot',
        actionTitle: 'Clear filters',
        onAction: clearAllFilters,
      };
    }
    if (hasActiveFilters) {
      return {
        title: 'No results',
        description: 'Try fewer or different filters.',
        illustration: duriErrorIllustration,
        illustrationTestID: 'activity-empty-mascot',
        actionTitle: 'Clear filters',
        onAction: clearAllFilters,
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
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => navigation.navigate('MonthlySummary')}
              style={styles.exportButton}
              feedbackType="scale"
              accessibilityRole="button"
              accessibilityLabel="Monthly summary"
            >
              <BarChart3 size={HEADER_ICON_SIZE} color={colors.primary} />
              <Text variant="label" color={colors.primary}>
                Summary
              </Text>
            </Pressable>
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

        <View style={styles.controlsRow}>
          <Pressable
            onPress={() => setAccountPickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={
              selectedAccount === ALL_ACCOUNTS ? 'All accounts' : currentAccountLabel
            }
            feedbackType="scale"
            style={styles.accountSelector}
          >
            <View style={styles.accountSelectorContent}>
              <Wallet size={16} color={colors.primary} />
              <Text variant="label" color={colors.ink} numberOfLines={1}>
                {currentAccountLabel}
              </Text>
            </View>
            <ChevronDown size={16} color={colors.textSecondary} />
          </Pressable>

          <Pressable
            onPress={() => setFilterSheetVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={
              activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : 'Filters'
            }
            feedbackType="scale"
            style={[
              styles.filtersButton,
              activeFilterCount > 0 && styles.filtersButtonActive,
            ]}
          >
            <SlidersHorizontal
              size={16}
              color={activeFilterCount > 0 ? colors.primary : colors.ink}
            />
            <Text
              variant="label"
              color={activeFilterCount > 0 ? colors.primary : colors.ink}
            >
              Filters
            </Text>
            {activeFilterCount > 0 ? (
              <View style={styles.badgeCount}>
                <Text
                  variant="caption"
                  color={colors.textInverse}
                  style={styles.badgeCountText}
                >
                  {activeFilterCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {hasActiveFilters ? (
          <View style={styles.activeFiltersRow}>
            {selectedAccount !== ALL_ACCOUNTS ? (
              <Pressable
                onPress={() => setSelectedAccount(ALL_ACCOUNTS)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${currentAccountLabel} filter`}
                style={styles.activeChip}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Text
                  variant="caption"
                  color={colors.primary}
                  style={styles.activeChipText}
                >
                  {currentAccountLabel}
                </Text>
                <X size={14} color={colors.primary} />
              </Pressable>
            ) : null}

            {filters.types.map((typeVal) => (
              <Pressable
                key={typeVal}
                onPress={() => removeTypeFilter(typeVal)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${getTypeLabel(typeVal)} filter`}
                style={styles.activeChip}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Text
                  variant="caption"
                  color={colors.primary}
                  style={styles.activeChipText}
                >
                  {getTypeLabel(typeVal)}
                </Text>
                <X size={14} color={colors.primary} />
              </Pressable>
            ))}

            {filters.datePreset !== 'all' ? (
              <Pressable
                onPress={removeDateFilter}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${getDatePresetLabel(filters.datePreset)} filter`}
                style={styles.activeChip}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Text
                  variant="caption"
                  color={colors.primary}
                  style={styles.activeChipText}
                >
                  {getDatePresetLabel(filters.datePreset)}
                </Text>
                <X size={14} color={colors.primary} />
              </Pressable>
            ) : null}

            {filters.direction !== 'all' ? (
              <Pressable
                onPress={removeDirectionFilter}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${getDirectionLabel(filters.direction)} filter`}
                style={styles.activeChip}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Text
                  variant="caption"
                  color={colors.primary}
                  style={styles.activeChipText}
                >
                  {getDirectionLabel(filters.direction)}
                </Text>
                <X size={14} color={colors.primary} />
              </Pressable>
            ) : null}

            {filters.status !== 'all' ? (
              <Pressable
                onPress={removeStatusFilter}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${getStatusLabel(filters.status)} filter`}
                style={styles.activeChip}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Text
                  variant="caption"
                  color={colors.primary}
                  style={styles.activeChipText}
                >
                  {getStatusLabel(filters.status)}
                </Text>
                <X size={14} color={colors.primary} />
              </Pressable>
            ) : null}

            <Pressable
              onPress={clearAllFilters}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              style={styles.clearAllBtn}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text
                variant="caption"
                color={colors.textMuted}
                style={styles.clearAllText}
              >
                Clear all
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {renderBody()}

      <AccountPickerSheet
        visible={accountPickerVisible}
        accounts={accounts}
        selectedAccountId={selectedAccount === ALL_ACCOUNTS ? null : selectedAccount}
        hideBalance={hideBalance}
        onSelect={(accountId) => {
          setSelectedAccount(accountId === selectedAccount ? ALL_ACCOUNTS : accountId);
          setAccountPickerVisible(false);
        }}
        onClose={() => setAccountPickerVisible(false)}
      />

      <ActivityFilterSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
        filters={filters}
        onApply={(newFilters) => setFilters(newFilters)}
        onClear={() => setFilters(DEFAULT_ACTIVITY_FILTERS)}
      />
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
    gap: spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  exportButton: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  accountSelector: {
    flex: 1,
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  filtersButton: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filtersButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  badgeCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeCountText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
  },
  activeFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  activeChip: {
    minHeight: CHIP_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primaryTint,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  activeChipText: {
    fontWeight: '600',
  },
  clearAllBtn: {
    minHeight: CHIP_MIN_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  clearAllText: {
    textDecorationLine: 'underline',
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
