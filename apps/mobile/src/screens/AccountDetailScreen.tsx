import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { Copy, Eye, EyeOff } from 'lucide-react-native';
import {
  colors,
  elevation,
  radius,
  size,
  spacing,
  toUserMessage,
  fetchAccountBalances,
  fetchTransactionHistory,
  type AccountBalance,
  type TransactionHistoryItem,
} from '@davao-bank/shared';
import type { RootStackParamList } from '../../App';
import { supabase } from '../lib/supabase';
import { reportNetworkResult } from '../lib/networkStatus';
import { useSettings } from '../context/SettingsContext';
import {
  FeatureScreen,
  Text,
  AmountText,
  Badge,
  Pressable,
  Button,
  EmptyState,
  Skeleton,
  TransactionRow,
  ListHairline,
  useToast,
  formatAccountLabel,
  groupedListStyles,
} from '../components';

type AccountDetailRouteProp = RouteProp<RootStackParamList, 'AccountDetail'>;

const AMOUNT_MAX_SCALE = 1.4;
const ACTION_BUTTON_SIZE = size.touch;
const ICON_SIZE = 20;

export function AccountDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<AccountDetailRouteProp>();
  const toast = useToast();
  const { hideBalance } = useSettings();

  const accountId = route.params.accountId;
  const initialAccount = route.params.account;

  const [account, setAccount] = useState<AccountBalance | null>(initialAccount ?? null);
  const [transactions, setTransactions] = useState<TransactionHistoryItem[]>([]);
  const [showFullNumber, setShowFullNumber] = useState(false);
  const [loading, setLoading] = useState(!initialAccount);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [accRes, txRes] = await Promise.all([
        fetchAccountBalances(supabase),
        fetchTransactionHistory(supabase),
      ]);

      reportNetworkResult(accRes.error || txRes.error);

      if (accRes.error || !accRes.data) {
        setError(toUserMessage(accRes.error, 'load'));
      } else {
        const found = accRes.data.find((a) => a.account_id === accountId);
        if (found) {
          setAccount(found);
          setError(null);
        } else {
          setError('Account not found.');
        }
      }

      if (!txRes.error && txRes.data) {
        setTransactions(txRes.data.filter((t) => t.account_id === accountId));
      }
    } catch (err) {
      reportNetworkResult(err);
      setError(toUserMessage(err, 'load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accountId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCopyAccountNumber = async () => {
    if (!account) return;
    await Clipboard.setStringAsync(account.account_number);
    toast.show('Account number copied');
  };

  const handleSeeAllActivity = () => {
    if (!account) return;
    // ActivityTab is nested inside Tabs navigator
    navigation.navigate('Tabs', {
      screen: 'ActivityTab',
      params: { accountId: account.account_id },
    });
  };

  const renderBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'active') {
      return <Badge label="Active" variant="info" />;
    }
    if (s === 'frozen') {
      return <Badge label="Frozen" variant="danger" />;
    }
    return <Badge label="Closed" variant="neutral" />;
  };

  const title = account ? formatAccountLabel(account) : 'Account detail';

  const maskedAccountNumber = account
    ? `•••• •••• ${account.account_number.slice(-4)}`
    : '•••• •••• ••••';

  const displayedAccountNumber = showFullNumber
    ? (account?.account_number ?? '')
    : maskedAccountNumber;

  const recentTransactions = transactions.slice(0, 5);

  return (
    <FeatureScreen
      title={title}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <Skeleton width="100%" height={120} style={styles.skeletonCard} />
          <Skeleton width="100%" height={80} style={styles.skeletonCard} />
          <Skeleton width="100%" height={200} style={styles.skeletonCard} />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text variant="bodyStrong" color={colors.ink}>
            Account unavailable
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            {error}
          </Text>
          <Button title="Try again" variant="secondary" onPress={loadData} />
        </View>
      ) : account ? (
        <View style={styles.content}>
          {/* Balance card */}
          <View style={styles.balanceCard}>
            <View style={styles.cardHeaderRow}>
              <Text variant="caption" color={colors.textSecondary}>
                AVAILABLE BALANCE
              </Text>
              {renderBadge(account.status)}
            </View>

            <AmountText
              amountCentavos={account.balance}
              hidden={hideBalance}
              variant="amount"
              color={colors.ink}
              showSign={false}
              maxFontSizeMultiplier={AMOUNT_MAX_SCALE}
            />
          </View>

          {/* Account number card */}
          <View style={styles.accountNumberCard}>
            <View style={styles.accountNumberInfo}>
              <Text variant="caption" color={colors.textSecondary}>
                ACCOUNT NUMBER
              </Text>
              <Text
                variant="bodyStrong"
                color={colors.ink}
                style={styles.accountNumberText}
              >
                {displayedAccountNumber}
              </Text>
            </View>

            <View style={styles.accountNumberActions}>
              <Pressable
                style={styles.actionButton}
                onPress={() => setShowFullNumber((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={
                  showFullNumber ? 'Hide full account number' : 'Show full account number'
                }
                hitSlop={0}
              >
                {showFullNumber ? (
                  <EyeOff size={ICON_SIZE} color={colors.ink} />
                ) : (
                  <Eye size={ICON_SIZE} color={colors.ink} />
                )}
              </Pressable>

              <Pressable
                style={styles.actionButton}
                onPress={handleCopyAccountNumber}
                accessibilityRole="button"
                accessibilityLabel="Copy account number"
                hitSlop={0}
              >
                <Copy size={ICON_SIZE} color={colors.primary} />
              </Pressable>
            </View>
          </View>

          {/* Recent transactions section */}
          <View style={styles.transactionsSection}>
            <View style={styles.transactionsHeaderRow}>
              <Text variant="title" color={colors.ink}>
                Recent transactions
              </Text>

              <Pressable
                style={styles.seeAllButton}
                onPress={handleSeeAllActivity}
                accessibilityRole="button"
                accessibilityLabel="See all activity"
              >
                <Text variant="bodyStrong" color={colors.primary}>
                  See all
                </Text>
              </Pressable>
            </View>

            {recentTransactions.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="Transactions for this account will appear here."
              />
            ) : (
              <View style={groupedListStyles.group}>
                {recentTransactions.map((tx, idx) => (
                  <React.Fragment key={tx.ledger_entry_id || tx.transaction_id}>
                    {idx > 0 && <ListHairline />}
                    <TransactionRow
                      transaction={tx}
                      onPress={() =>
                        navigation.navigate('Receipt', {
                          transactionId: tx.transaction_id,
                          accountId: account.account_id,
                        })
                      }
                    />
                  </React.Fragment>
                ))}
              </View>
            )}
          </View>
        </View>
      ) : null}
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
  },
  loadingContainer: {
    gap: spacing.base,
  },
  skeletonCard: {
    borderRadius: radius.md,
  },
  errorContainer: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
    ...elevation.card,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountNumberCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...elevation.card,
  },
  accountNumberInfo: {
    gap: spacing.xs,
    flex: 1,
  },
  accountNumberText: {
    letterSpacing: 0.5,
  },
  accountNumberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionButton: {
    width: ACTION_BUTTON_SIZE,
    height: ACTION_BUTTON_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionsSection: {
    gap: spacing.md,
  },
  transactionsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  seeAllButton: {
    minHeight: size.touch,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
});
