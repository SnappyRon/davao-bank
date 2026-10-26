import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import {
  Send,
  PlusCircle,
  MinusCircle,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Zap,
  CalendarClock,
} from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  formatCentavosToPHP,
  fetchUserProfile,
  fetchAccountBalances,
  fetchTransactionHistory,
  fetchHealthCheck,
  type Profile,
  type AccountBalance,
  type TransactionHistoryItem,
  type HealthCheck,
  type MoneyOperationResult,
  type ScheduledPayment,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';
import {
  Screen,
  Text,
  Card,
  ActionTile,
  ActionTileGrid,
  AmountText,
  TransactionRow,
  EmptyState,
  Skeleton,
  Logo,
  Badge,
} from '../components';
import { TransferModal } from './TransferModal';
import { DepositModal } from './DepositModal';
import { WithdrawModal } from './WithdrawModal';
import { TransactionDetailModal } from './TransactionDetailModal';
import { SuspendedScreen } from './SuspendedScreen';
import { PayBillsModal } from './PayBillsModal';
import { ScheduledPaymentsModal } from './ScheduledPaymentsModal';

interface HomeScreenProps {
  onNavigateToActivity?: () => void;
  onNavigateToProfile?: () => void;
}

export function HomeScreen({
  onNavigateToActivity,
  onNavigateToProfile,
}: HomeScreenProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [transactions, setTransactions] = useState<TransactionHistoryItem[]>([]);
  const [selectedAccountIndex, setSelectedAccountIndex] = useState<number>(0);
  const { hideBalance, toggleHideBalance } = useSettings();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Modals
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [isPayBillsOpen, setIsPayBillsOpen] = useState(false);
  const [isScheduledOpen, setIsScheduledOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<TransactionHistoryItem | null>(null);

  // Upcoming scheduled payments
  const [upcomingSchedules, setUpcomingSchedules] = useState<ScheduledPayment[]>([]);

  // Dev health check
  const [health, setHealth] = useState<HealthCheck | null>(null);

  const loadData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const [profileRes, accountsRes, txRes] = await Promise.all([
          fetchUserProfile(supabase, user.id),
          fetchAccountBalances(supabase),
          fetchTransactionHistory(supabase),
        ]);

        if (profileRes.data) setProfile(profileRes.data);
        if (accountsRes.data) setAccounts(accountsRes.data);
        if (txRes.data) setTransactions(txRes.data);
      }

      // Load upcoming scheduled payments
      try {
        const { data: schedData } = await supabase
          .from('scheduled_payments')
          .select('*')
          .eq('status', 'active')
          .order('next_run_date', { ascending: true })
          .limit(3);
        if (schedData) setUpcomingSchedules(schedData as ScheduledPayment[]);
      } catch {
        // Non-critical
      }

      if (__DEV__) {
        const { data: healthData } = await fetchHealthCheck(supabase);
        if (healthData) setHealth(healthData);
      }
    } catch (err) {
      console.warn('Error loading Home data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getInitials = (name?: string | null) => {
    if (!name) return 'DB';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const currentAccount = accounts[selectedAccountIndex] || accounts[0];
  const totalBalance = accounts.reduce((acc, a) => acc + a.balance, 0);

  const switchAccount = () => {
    if (accounts.length > 1) {
      setSelectedAccountIndex((prev) => (prev + 1) % accounts.length);
    }
  };

  if (profile?.status === 'suspended') {
    return <SuspendedScreen profile={profile} userEmail={null} onRefresh={loadData} />;
  }

  return (
    <Screen style={styles.screen}>
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
        {/* Top Greeting Row */}
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <Logo variant="mark" size={32} />
            <View style={styles.greetingTextContainer}>
              <Text variant="caption" color={colors.textSecondary}>
                Maayong adlaw,
              </Text>
              <Text variant="bodyStrong" color={colors.ink}>
                {profile?.full_name?.split(' ')[0] || 'Customer'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.avatarButton}
            activeOpacity={0.8}
            onPress={onNavigateToProfile}
          >
            <Text variant="bodyStrong" color={colors.primary}>
              {getInitials(profile?.full_name)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Hero Balance Card */}
        {loading ? (
          <Skeleton width="100%" height={160} style={styles.cardSkeleton} />
        ) : (
          <View style={styles.balanceCard}>
            <View style={styles.balanceHeader}>
              <TouchableOpacity
                style={styles.accountPill}
                activeOpacity={accounts.length > 1 ? 0.7 : 1}
                onPress={switchAccount}
              >
                <Text variant="caption" color={colors.textInverse}>
                  Savings · {currentAccount?.account_number || '•••• ••••'}
                </Text>
                {accounts.length > 1 ? (
                  <ChevronDown size={14} color={colors.textInverse} />
                ) : null}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={toggleHideBalance}
                style={styles.eyeButton}
                activeOpacity={0.7}
                accessibilityLabel={
                  hideBalance ? 'Balance hidden. Double tap to reveal' : 'Hide balance'
                }
              >
                {hideBalance ? (
                  <EyeOff size={20} color={colors.textInverse} />
                ) : (
                  <Eye size={20} color={colors.textInverse} />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.balanceAmountContainer}>
              <Text
                variant="caption"
                color={colors.primaryTint}
                style={styles.balanceSubtext}
              >
                Total Available Balance
              </Text>
              <AmountText
                amountCentavos={totalBalance}
                hidden={hideBalance}
                variant="display"
                color={colors.textInverse}
                showSign={false}
              />
            </View>
          </View>
        )}

        {/* Action Grid: 5 tiles in 3x2 (Stage C; QR added in Stage D) */}
        <ActionTileGrid columns={3}>
          <ActionTile
            label="Transfer"
            color="blue"
            icon={<Send size={24} color={colors.textInverse} />}
            onPress={() => setIsTransferOpen(true)}
          />
          <ActionTile
            label="Pay Bills"
            color="orange"
            icon={<Zap size={24} color={colors.textInverse} />}
            onPress={() => setIsPayBillsOpen(true)}
          />
          <ActionTile
            label="Cash-in"
            color="green"
            icon={<PlusCircle size={24} color={colors.textInverse} />}
            onPress={() => setIsDepositOpen(true)}
          />
          <ActionTile
            label="Cash-out"
            color="orange"
            icon={<MinusCircle size={24} color={colors.textInverse} />}
            onPress={() => setIsWithdrawOpen(true)}
          />
          <ActionTile
            label="Scheduled"
            color="yellow"
            icon={<CalendarClock size={24} color={colors.ink} />}
            onPress={() => setIsScheduledOpen(true)}
          />
        </ActionTileGrid>

        {/* Upcoming Payments Strip */}
        {upcomingSchedules.length > 0 && (
          <View>
            <View style={styles.sectionHeader}>
              <Text variant="h2">Upcoming Payments</Text>
              <TouchableOpacity
                onPress={() => setIsScheduledOpen(true)}
                style={styles.seeAllButton}
                activeOpacity={0.7}
              >
                <Text variant="bodyStrong" color={colors.primary}>
                  See all
                </Text>
                <ChevronRight size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
            {upcomingSchedules.map((sched) => (
              <TouchableOpacity
                key={sched.id}
                style={styles.upcomingCard}
                onPress={() => setIsScheduledOpen(true)}
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
        )}

        {/* Recent Activity Section */}
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
                onPress={() => setSelectedTx(item)}
              />
            ))}
          </View>
        )}

        {/* Dev Diagnostics (Only rendered when __DEV__ is true) */}
        {__DEV__ && health ? (
          <View style={styles.devCard}>
            <View style={styles.devHeader}>
              <ShieldCheck size={16} color={colors.textMuted} />
              <Text variant="caption" color={colors.textMuted}>
                DEV DIAGNOSTICS: {health.status} (
                {new Date(health.checked_at).toLocaleTimeString()})
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Money Action Modals */}
      <TransferModal
        visible={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
        accounts={accounts}
        onTransferSuccess={() => {
          setIsTransferOpen(false);
          loadData();
        }}
      />

      <DepositModal
        visible={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
        accounts={accounts}
        onDepositSuccess={() => {
          setIsDepositOpen(false);
          loadData();
        }}
      />

      <WithdrawModal
        visible={isWithdrawOpen}
        onClose={() => setIsWithdrawOpen(false)}
        accounts={accounts}
        onWithdrawSuccess={() => {
          setIsWithdrawOpen(false);
          loadData();
        }}
      />

      <PayBillsModal
        visible={isPayBillsOpen}
        onClose={() => setIsPayBillsOpen(false)}
        accounts={accounts}
        onPaymentSuccess={() => {
          setIsPayBillsOpen(false);
          loadData();
        }}
      />

      <ScheduledPaymentsModal
        visible={isScheduledOpen}
        onClose={() => setIsScheduledOpen(false)}
        onRefresh={loadData}
      />

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
  container: {
    padding: spacing.screenSide,
    paddingTop: spacing.base,
    paddingBottom: spacing['4xl'],
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.base,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  greetingTextContainer: {
    marginLeft: spacing.xs,
  },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  cardSkeleton: {
    borderRadius: radius.lg,
    marginBottom: spacing.base,
  },
  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xs,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryPressed,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  eyeButton: {
    padding: spacing.xs,
  },
  balanceAmountContainer: {
    marginTop: spacing.xl,
  },
  balanceSubtext: {
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  activitySkeletonContainer: {
    gap: spacing.sm,
  },
  txSkeleton: {
    borderRadius: radius.md,
  },
  emptyActivity: {
    marginTop: spacing.md,
  },
  txList: {
    gap: spacing.sm,
  },
  devCard: {
    marginTop: spacing.xl,
    padding: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
  },
  devHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  upcomingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
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
