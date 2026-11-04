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
  ChevronRight,
  ShieldCheck,
  Zap,
  CalendarClock,
  QrCode,
  Inbox,
  User,
} from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  fetchUserProfile,
  fetchAccountBalances,
  fetchTransactionHistory,
  fetchHealthCheck,
  type Profile,
  type AccountBalance,
  type TransactionHistoryItem,
  type HealthCheck,
  type ScheduledPayment,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';
import {
  Screen,
  Text,
  ActionTile,
  ActionTileGrid,
  Logo,
  CurrencyWatchCard,
} from '../components';
import { TransferModal } from './TransferModal';
import { DepositModal } from './DepositModal';
import { WithdrawModal } from './WithdrawModal';
import { TransactionDetailModal } from './TransactionDetailModal';
import { SuspendedScreen } from './SuspendedScreen';
import { PayBillsModal } from './PayBillsModal';
import { ScheduledPaymentsModal } from './ScheduledPaymentsModal';
import { QRHubModal } from './QRHubModal';
import { PaymentRequestsModal } from './PaymentRequestsModal';
import { FXRatesModal } from './FXRatesModal';
import { HomeBalanceCard } from './home/HomeBalanceCard';
import { HomeUpcomingPayments } from './home/HomeUpcomingPayments';
import { HomeRecentActivity } from './home/HomeRecentActivity';

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
  const [isQROpen, setIsQROpen] = useState(false);
  const [isRequestsOpen, setIsRequestsOpen] = useState(false);
  const [isFXOpen, setIsFXOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<TransactionHistoryItem | null>(null);

  // QR transfer prefill state
  const [qrPrefillAccount, setQrPrefillAccount] = useState<string | undefined>();
  const [qrPrefillAmount, setQrPrefillAmount] = useState<number | undefined>();
  const [qrPrefillNote, setQrPrefillNote] = useState<string | undefined>();

  // Upcoming scheduled payments & Pending requests
  const [upcomingSchedules, setUpcomingSchedules] = useState<ScheduledPayment[]>([]);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);

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

        try {
          const { count } = await supabase
            .from('payment_requests')
            .select('*', { count: 'exact', head: true })
            .eq('payer_user_id', user.id)
            .eq('status', 'pending');
          setPendingRequestsCount(count || 0);
        } catch {
          // Non-critical
        }
      }

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
            {profile?.full_name ? (
              <Text variant="bodyStrong" color={colors.primary}>
                {getInitials(profile.full_name)}
              </Text>
            ) : (
              <User size={18} color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>

        {/* Hero Balance Card */}
        <HomeBalanceCard
          loading={loading}
          accounts={accounts}
          selectedAccountIndex={selectedAccountIndex}
          hideBalance={hideBalance}
          onSwitchAccount={switchAccount}
          onToggleHideBalance={toggleHideBalance}
        />

        {/* Pending Payment Requests Banner */}
        {pendingRequestsCount > 0 && (
          <TouchableOpacity
            style={styles.requestsBanner}
            onPress={() => setIsRequestsOpen(true)}
            activeOpacity={0.8}
          >
            <View style={styles.requestsIconBox}>
              <Inbox size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" color={colors.primary}>
                {pendingRequestsCount} Pending Payment Request
                {pendingRequestsCount > 1 ? 's' : ''}
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
                Tap to review, pay, or decline
              </Text>
            </View>
            <ChevronRight size={18} color={colors.primary} />
          </TouchableOpacity>
        )}

        {/* Action Grid: 6 tiles in 3x2 (Final Stages C & D) */}
        <ActionTileGrid columns={3}>
          <ActionTile
            label="Transfer"
            color="blue"
            icon={<Send size={24} color={colors.textInverse} />}
            onPress={() => {
              setQrPrefillAccount(undefined);
              setQrPrefillAmount(undefined);
              setQrPrefillNote(undefined);
              setIsTransferOpen(true);
            }}
          />
          <ActionTile
            label="Pay Bills"
            color="orange"
            icon={<Zap size={24} color={colors.textInverse} />}
            onPress={() => setIsPayBillsOpen(true)}
          />
          <ActionTile
            label="QR"
            color="purple"
            icon={<QrCode size={24} color={colors.textInverse} />}
            onPress={() => setIsQROpen(true)}
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

        {/* Currency Watch Card (§E.2) */}
        <CurrencyWatchCard onPress={() => setIsFXOpen(true)} />

        {/* Upcoming Payments Strip */}
        <HomeUpcomingPayments
          schedules={upcomingSchedules}
          onOpenSchedules={() => setIsScheduledOpen(true)}
        />

        {/* Recent Activity Section */}
        <HomeRecentActivity
          loading={loading}
          transactions={transactions}
          hideBalance={hideBalance}
          onNavigateToActivity={onNavigateToActivity}
          onSelectTransaction={setSelectedTx}
        />

        {/* Dev Diagnostics */}
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
        onClose={() => {
          setIsTransferOpen(false);
          setQrPrefillAccount(undefined);
          setQrPrefillAmount(undefined);
          setQrPrefillNote(undefined);
        }}
        accounts={accounts}
        initialRecipientAccount={qrPrefillAccount}
        initialAmountCentavos={qrPrefillAmount}
        initialNote={qrPrefillNote}
        onRequestMoneyPress={() => {
          setIsTransferOpen(false);
          setIsQROpen(true);
        }}
        onTransferSuccess={() => {
          loadData();
        }}
      />

      <DepositModal
        visible={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
        accounts={accounts}
        onDepositSuccess={() => {
          loadData();
        }}
      />

      <WithdrawModal
        visible={isWithdrawOpen}
        onClose={() => setIsWithdrawOpen(false)}
        accounts={accounts}
        onWithdrawSuccess={() => {
          loadData();
        }}
      />

      <PayBillsModal
        visible={isPayBillsOpen}
        onClose={() => setIsPayBillsOpen(false)}
        accounts={accounts}
        onPaymentSuccess={() => {
          loadData();
        }}
      />

      <ScheduledPaymentsModal
        visible={isScheduledOpen}
        onClose={() => setIsScheduledOpen(false)}
        onRefresh={loadData}
      />

      <QRHubModal
        visible={isQROpen}
        onClose={() => setIsQROpen(false)}
        accounts={accounts}
        onScanResult={(res) => {
          setIsQROpen(false);
          setQrPrefillAccount(res.accountNumber);
          setQrPrefillAmount(res.amountCentavos);
          setQrPrefillNote(res.note);
          setIsTransferOpen(true);
        }}
        onManualTransferFallback={() => {
          setIsQROpen(false);
          setIsTransferOpen(true);
        }}
        onRequestSent={loadData}
      />

      <PaymentRequestsModal
        visible={isRequestsOpen}
        onClose={() => setIsRequestsOpen(false)}
        accounts={accounts}
        onPaymentSuccess={loadData}
      />

      <FXRatesModal visible={isFXOpen} onClose={() => setIsFXOpen(false)} />

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
    backgroundColor: colors.background,
  },
  container: {
    padding: spacing.base,
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
    gap: 1,
  },
  avatarButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  requestsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  requestsIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devCard: {
    marginTop: spacing.xl,
    padding: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  devHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
