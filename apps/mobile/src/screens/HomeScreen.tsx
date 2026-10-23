import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  Platform,
} from 'react-native';
import {
  colors,
  coreColorSwatches,
  fetchHealthCheck,
  fetchUserProfile,
  fetchAccountBalances,
  fetchTransactionHistory,
  fetchNotifications,
  formatCentavosToPHP,
  type HealthCheck,
  type Profile,
  type AccountBalance,
  type TransactionHistoryItem,
  type Notification,
  type MoneyOperationResult,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { TransferModal } from './TransferModal';
import { DepositModal } from './DepositModal';
import { WithdrawModal } from './WithdrawModal';
import { NotificationsModal } from './NotificationsModal';
import { TransactionDetailModal } from './TransactionDetailModal';
import { SuspendedScreen } from './SuspendedScreen';

interface HomeScreenProps {
  onSignOut?: () => void;
}

type FilterType = 'all' | 'transfer' | 'deposit' | 'withdrawal';

export function HomeScreen({ onSignOut }: HomeScreenProps) {
  // User & Profile State
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState<boolean>(false);

  // Core Banking Data State
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [transactions, setTransactions] = useState<TransactionHistoryItem[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState<boolean>(true);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [filterType, setFilterType] = useState<FilterType>('all');

  // Backend Health State (preserved from Phase 1)
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(true);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [showSystemInfo, setShowSystemInfo] = useState<boolean>(false);

  // Modal State
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [selectedTxForDetail, setSelectedTxForDetail] =
    useState<TransactionHistoryItem | null>(null);

  // Success Flash Banner
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const loadUserData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setUserEmail(user.email || null);
        const { data: profileData } = await fetchUserProfile(supabase, user.id);
        if (profileData) {
          setProfile(profileData);
        }
      }
    } catch (err) {
      console.warn('Failed to load user profile in HomeScreen:', err);
    }
  };

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    const { data, error } = await fetchAccountBalances(supabase);
    if (!error && data) {
      setAccounts(data);
    }
    setLoadingAccounts(false);
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data, error } = await fetchTransactionHistory(supabase);
    if (!error && data) {
      setTransactions(data);
    }
    setLoadingHistory(false);
  }, []);

  const loadNotificationsData = useCallback(async () => {
    const { data, error } = await fetchNotifications(supabase);
    if (!error && data) {
      setNotifications(data);
    }
  }, []);

  const checkBackendHealth = async () => {
    setHealthLoading(true);
    setHealthError(null);
    const start = Date.now();
    const result = await fetchHealthCheck(supabase);
    const elapsed = Date.now() - start;

    if (result.error) {
      setHealthError(result.error);
      setHealth(null);
    } else {
      setHealth(result.data);
      setLastChecked(`${new Date().toLocaleTimeString()} (${elapsed}ms)`);
    }
    setHealthLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadAccounts(),
      loadHistory(),
      loadNotificationsData(),
      checkBackendHealth(),
    ]);
    setRefreshing(false);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      if (onSignOut) {
        onSignOut();
      }
    } catch (err) {
      console.error('Error signing out:', err);
    } finally {
      setSigningOut(false);
    }
  };

  // Handlers for successful money operations
  const handleTransferSuccess = (result: MoneyOperationResult) => {
    setSuccessBanner(
      `Transfer completed: ${formatCentavosToPHP(result.amount)} sent successfully!`
    );
    loadAccounts();
    loadHistory();
    loadNotificationsData();
    setTimeout(() => setSuccessBanner(null), 5000);
  };

  const handleDepositSuccess = (result: MoneyOperationResult) => {
    setSuccessBanner(
      `Deposit confirmed: ${formatCentavosToPHP(result.amount)} credited to your account!`
    );
    loadAccounts();
    loadHistory();
    loadNotificationsData();
    setTimeout(() => setSuccessBanner(null), 5000);
  };

  const handleWithdrawSuccess = (result: MoneyOperationResult) => {
    setSuccessBanner(
      `Cash-out processed: ${formatCentavosToPHP(result.amount)} debited successfully!`
    );
    loadAccounts();
    loadHistory();
    loadNotificationsData();
    setTimeout(() => setSuccessBanner(null), 5000);
  };

  useEffect(() => {
    loadUserData();
    loadAccounts();
    loadHistory();
    loadNotificationsData();
    checkBackendHealth();
  }, [loadAccounts, loadHistory, loadNotificationsData]);

  // Compute total balance across accounts (authoritative from account_balances)
  const totalBalance = accounts.reduce((acc, curr) => acc + curr.balance, 0);
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Filter transactions
  const filteredTransactions = transactions.filter((t) => {
    if (filterType === 'all') return true;
    return t.type === filterType;
  });

  // If customer profile is suspended, show dedicated suspended screen and block money actions
  if (profile?.status === 'suspended') {
    return (
      <SuspendedScreen
        profile={profile}
        userEmail={userEmail}
        onRefresh={onRefresh}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Top App Bar */}
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoBadgeText}>DB</Text>
            </View>
            <View>
              <Text style={styles.brandTitle}>Davao Bank</Text>
              <Text style={styles.customerName}>
                {profile?.full_name || userEmail || 'Customer Portal'}
              </Text>
            </View>
          </View>

          <View style={styles.topBarRight}>
            {/* Notification Bell */}
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setIsNotificationsOpen(true)}
              accessibilityLabel="View notifications"
            >
              <Text style={styles.bellIcon}>🔔</Text>
              {unreadCount > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Sign Out */}
            <TouchableOpacity
              style={styles.signOutButton}
              onPress={handleSignOut}
              disabled={signingOut}
              activeOpacity={0.8}
            >
              {signingOut ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.signOutButtonText}>Sign Out</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Success Banner */}
        {successBanner && (
          <View style={styles.successBanner}>
            <Text style={styles.successBannerText}>✓ {successBanner}</Text>
          </View>
        )}

        {/* Primary Account Balances Card */}
        <View style={styles.balanceHeroCard}>
          <View style={styles.balanceHeroHeader}>
            <Text style={styles.balanceHeroOverline}>TOTAL AVAILABLE BALANCE</Text>
            <TouchableOpacity onPress={onRefresh}>
              <Text style={styles.refreshIconText}>🔄</Text>
            </TouchableOpacity>
          </View>

          {loadingAccounts && accounts.length === 0 ? (
            <ActivityIndicator
              size="large"
              color={colors.textInverse}
              style={{ marginVertical: 16 }}
            />
          ) : (
            <>
              <Text style={styles.totalBalanceAmount}>
                {formatCentavosToPHP(totalBalance)}
              </Text>

              {/* Individual Accounts List */}
              <View style={styles.accountsListContainer}>
                {accounts.map((acc) => (
                  <View key={acc.account_id} style={styles.accountRowItem}>
                    <View>
                      <View style={styles.accountTypeRow}>
                        <Text style={styles.accountTypeText}>
                          {acc.type.toUpperCase()} ACCOUNT
                        </Text>
                        <View
                          style={[
                            styles.accountStatusTag,
                            {
                              backgroundColor:
                                acc.status === 'active'
                                  ? colors.successLight
                                  : colors.errorLight,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.accountStatusTagText,
                              {
                                color:
                                  acc.status === 'active'
                                    ? colors.successDark
                                    : colors.errorDark,
                              },
                            ]}
                          >
                            {acc.status}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.accountNumberText}>{acc.account_number}</Text>
                    </View>
                    <Text style={styles.accountBalanceText}>
                      {formatCentavosToPHP(acc.balance)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={styles.balanceDisclaimer}>
            Authoritative ledger balance computed server-side in integer minor units
            (centavos).
          </Text>
        </View>

        {/* Quick Banking Actions Row */}
        <View style={styles.actionsCard}>
          <Text style={styles.sectionHeader}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            {/* Transfer / Send */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setIsTransferOpen(true)}
              activeOpacity={0.8}
            >
              <View
                style={[styles.actionIconBox, { backgroundColor: colors.primaryLight }]}
              >
                <Text style={styles.actionIcon}>↗️</Text>
              </View>
              <Text style={styles.actionBtnLabel}>Transfer</Text>
              <Text style={styles.actionBtnSub}>Send Money</Text>
            </TouchableOpacity>

            {/* Deposit / Cash In */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setIsDepositOpen(true)}
              activeOpacity={0.8}
            >
              <View
                style={[styles.actionIconBox, { backgroundColor: colors.successLight }]}
              >
                <Text style={styles.actionIcon}>💳</Text>
              </View>
              <Text style={styles.actionBtnLabel}>Cash In</Text>
              <Text style={styles.actionBtnSub}>Deposit</Text>
            </TouchableOpacity>

            {/* Withdraw / Cash Out */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setIsWithdrawOpen(true)}
              activeOpacity={0.8}
            >
              <View
                style={[styles.actionIconBox, { backgroundColor: colors.warningLight }]}
              >
                <Text style={styles.actionIcon}>🏧</Text>
              </View>
              <Text style={styles.actionBtnLabel}>Cash Out</Text>
              <Text style={styles.actionBtnSub}>Withdraw</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Transaction History Section */}
        <View style={styles.card}>
          <View style={styles.historyHeaderRow}>
            <View>
              <Text style={styles.sectionOverline}>Ledger Activity</Text>
              <Text style={styles.cardTitle}>Transaction History</Text>
            </View>
            <TouchableOpacity onPress={loadHistory}>
              <Text style={styles.viewAllText}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {/* Filter Chips */}
          <View style={styles.filterChipRow}>
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'transfer', label: 'Transfers' },
                { key: 'deposit', label: 'Deposits' },
                { key: 'withdrawal', label: 'Cash Out' },
              ] as const
            ).map((chip) => (
              <TouchableOpacity
                key={chip.key}
                style={[
                  styles.filterChip,
                  filterType === chip.key && styles.filterChipActive,
                ]}
                onPress={() => setFilterType(chip.key)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filterType === chip.key && styles.filterChipTextActive,
                  ]}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Transactions List */}
          {loadingHistory && transactions.length === 0 ? (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ marginVertical: 24 }}
            />
          ) : filteredTransactions.length === 0 ? (
            <View style={styles.emptyHistoryBox}>
              <Text style={styles.emptyHistoryIcon}>📝</Text>
              <Text style={styles.emptyHistoryTitle}>No transactions recorded</Text>
              <Text style={styles.emptyHistorySubtitle}>
                {filterType === 'all'
                  ? 'Your transfer, deposit, and cash-out activities will appear here.'
                  : `No ${filterType} transactions found.`}
              </Text>
            </View>
          ) : (
            <View style={styles.transactionsList}>
              {filteredTransactions.map((tx) => {
                const isCredit = tx.signed_amount > 0;
                const formattedTime = new Date(tx.created_at).toLocaleDateString(
                  'en-PH',
                  {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }
                );

                return (
                  <TouchableOpacity
                    key={tx.ledger_entry_id}
                    style={styles.txItemRow}
                    onPress={() => setSelectedTxForDetail(tx)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.txLeftGroup}>
                      <View
                        style={[
                          styles.txIconBox,
                          {
                            backgroundColor: isCredit
                              ? colors.successLight
                              : colors.surfaceHover,
                          },
                        ]}
                      >
                        <Text style={styles.txGlyph}>
                          {tx.type === 'deposit'
                            ? '💳'
                            : tx.type === 'withdrawal'
                              ? '🏧'
                              : isCredit
                                ? '↙️'
                                : '↗️'}
                        </Text>
                      </View>
                      <View style={styles.txMetaGroup}>
                        <Text style={styles.txTitleText}>
                          {tx.type === 'transfer'
                            ? isCredit
                              ? `Received from ${tx.counterparty_account_number || 'transfer'}`
                              : `Sent to ${tx.counterparty_account_number || 'transfer'}`
                            : tx.type === 'deposit'
                              ? 'Cash-In / Deposit'
                              : 'Cash-Out / Withdrawal'}
                        </Text>
                        <Text style={styles.txDateText}>
                          {formattedTime} • Ref: {tx.reference || 'None'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.txRightGroup}>
                      <Text
                        style={[
                          styles.txAmountText,
                          {
                            color: isCredit ? colors.success : colors.textPrimary,
                          },
                        ]}
                      >
                        {isCredit ? '+' : ''}
                        {formatCentavosToPHP(tx.signed_amount)}
                      </Text>
                      <Text style={styles.txStatusText}>● {tx.status}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Collapsible System Health & Design Tokens */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.systemToggleRow}
            onPress={() => setShowSystemInfo(!showSystemInfo)}
            activeOpacity={0.8}
          >
            <View>
              <Text style={styles.sectionOverline}>System Verification</Text>
              <Text style={styles.cardTitle}>Backend Health &amp; Palette</Text>
            </View>
            <Text style={styles.toggleIcon}>{showSystemInfo ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {showSystemInfo && (
            <View style={styles.systemContent}>
              {/* Backend status */}
              <View
                style={[
                  styles.statusBanner,
                  healthLoading
                    ? styles.statusBannerNeutral
                    : health?.status === 'ok'
                      ? styles.statusBannerSuccess
                      : styles.statusBannerError,
                ]}
              >
                <View style={styles.statusIndicatorRow}>
                  {healthLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor:
                            health?.status === 'ok' ? colors.success : colors.error,
                        },
                      ]}
                    />
                  )}
                  <Text
                    style={[
                      styles.statusText,
                      {
                        color:
                          health?.status === 'ok'
                            ? colors.success
                            : healthError
                              ? colors.error
                              : colors.textPrimary,
                      },
                    ]}
                  >
                    {healthLoading
                      ? 'Connecting...'
                      : health?.status === 'ok'
                        ? 'Backend: ok (RLS & RPCs healthy)'
                        : `Backend: ${healthError || 'Connection Failed'}`}
                  </Text>
                </View>
                {health && (
                  <Text style={styles.healthDetailSub}>
                    Verified at: {lastChecked || 'just now'}
                  </Text>
                )}
              </View>

              {/* Palette tokens */}
              <View style={styles.swatchRow}>
                {coreColorSwatches.map((item) => (
                  <View key={item.id} style={styles.swatchBlock}>
                    <View style={[styles.colorBox, { backgroundColor: item.hex }]} />
                    <Text style={styles.swatchName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.swatchHex}>{item.hex}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Phase Scope Boundary Notice */}
        <View style={styles.footerNotice}>
          <Text style={styles.footerNoticeTitle}>Davao Bank • Phase 3 Core Banking</Text>
          <Text style={styles.footerNoticeText}>
            Simulated Prototype (§6.1). Server-authoritative double-entry ledger. All
            transactions are atomic, idempotent, and protected with deterministic row
            locks.
          </Text>
        </View>
      </ScrollView>

      {/* Modals */}
      <TransferModal
        visible={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
        accounts={accounts}
        onTransferSuccess={handleTransferSuccess}
      />

      <DepositModal
        visible={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
        accounts={accounts}
        onDepositSuccess={handleDepositSuccess}
      />

      <WithdrawModal
        visible={isWithdrawOpen}
        onClose={() => setIsWithdrawOpen(false)}
        accounts={accounts}
        onWithdrawSuccess={handleWithdrawSuccess}
      />

      <NotificationsModal
        visible={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onRefresh={loadNotificationsData}
      />

      <TransactionDetailModal
        visible={!!selectedTxForDetail}
        onClose={() => setSelectedTxForDetail(null)}
        transaction={selectedTxForDetail}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadgeText: {
    color: colors.textInverse,
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 1,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  customerName: {
    fontSize: 12,
    color: colors.textMuted,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bellIcon: {
    fontSize: 18,
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.error,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: '800',
  },
  signOutButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.surfaceHover,
    borderWidth: 1,
    borderColor: colors.border,
  },
  signOutButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  successBanner: {
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: 12,
    padding: 12,
  },
  successBannerText: {
    color: colors.successDark,
    fontSize: 13,
    fontWeight: '700',
  },
  balanceHeroCard: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 20,
    gap: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  balanceHeroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceHeroOverline: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  refreshIconText: {
    fontSize: 16,
  },
  totalBalanceAmount: {
    color: colors.textInverse,
    fontSize: 34,
    fontWeight: '900',
  },
  accountsListContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  accountRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accountTypeText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: '700',
  },
  accountStatusTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  accountStatusTagText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  accountNumberText: {
    color: colors.textInverse,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
    marginTop: 2,
  },
  accountBalanceText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '800',
  },
  balanceDisclaimer: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 10,
    lineHeight: 14,
  },
  actionsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  actionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  actionIcon: {
    fontSize: 20,
  },
  actionBtnLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  actionBtnSub: {
    fontSize: 10,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionOverline: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  filterChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceHover,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.textInverse,
  },
  emptyHistoryBox: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 6,
  },
  emptyHistoryIcon: {
    fontSize: 32,
  },
  emptyHistoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptyHistorySubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 240,
  },
  transactionsList: {
    gap: 8,
  },
  txItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  txLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  txIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txGlyph: {
    fontSize: 16,
  },
  txMetaGroup: {
    flex: 1,
  },
  txTitleText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  txDateText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  txRightGroup: {
    alignItems: 'flex-end',
    gap: 2,
  },
  txAmountText: {
    fontSize: 14,
    fontWeight: '800',
  },
  txStatusText: {
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'capitalize',
  },
  systemToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleIcon: {
    fontSize: 14,
    color: colors.textMuted,
  },
  systemContent: {
    gap: 12,
    marginTop: 6,
  },
  statusBanner: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    gap: 4,
  },
  statusBannerNeutral: {
    backgroundColor: colors.surfaceHover,
    borderColor: colors.border,
  },
  statusBannerSuccess: {
    backgroundColor: colors.successLight,
    borderColor: colors.success,
  },
  statusBannerError: {
    backgroundColor: colors.errorLight,
    borderColor: colors.error,
  },
  statusIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  healthDetailSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: 16,
  },
  swatchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  swatchBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  colorBox: {
    width: '100%',
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  swatchName: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  swatchHex: {
    fontSize: 8,
    color: colors.textMuted,
  },
  footerNotice: {
    padding: 14,
    backgroundColor: colors.surfaceHover,
    borderRadius: 12,
    gap: 4,
  },
  footerNoticeTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  footerNoticeText: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
  },
});
