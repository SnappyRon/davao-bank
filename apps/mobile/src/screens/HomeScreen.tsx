import React, { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
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
  size,
  toUserMessage,
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
import { reportNetworkResult } from '../lib/networkStatus';
import { useSettings } from '../context/SettingsContext';
import {
  Screen,
  Text,
  ActionTile,
  ActionTileGrid,
  Logo,
  CurrencyWatchCard,
  Pressable,
  AccountPickerSheet,
  actionTileIconColor,
  FLOATING_TAB_BAR_HEIGHT,
  floatingTabBarBottomOffset,
} from '../components';
import { SuspendedScreen } from './SuspendedScreen';
import { HomeBalanceCard } from './home/HomeBalanceCard';
import { HomeUpcomingPayments } from './home/HomeUpcomingPayments';
import { HomeRecentActivity } from './home/HomeRecentActivity';

/** Spec 7B.1 header: 56 pt tall, avatar 40 inside a 44 pt hit area. */
const HEADER_HEIGHT = 56;
const AVATAR_SIZE = 40;
const TILE_ICON_SIZE = 20;
/**
 * The default account must not depend on the order the view returns rows in:
 * savings first, then by account number.
 */
function sortAccounts(list: AccountBalance[]): AccountBalance[] {
  return [...list].sort(
    (a, b) =>
      (a.type === 'savings' ? 0 : 1) - (b.type === 'savings' ? 0 : 1) ||
      a.account_number.localeCompare(b.account_number)
  );
}

interface HomeScreenProps {
  onNavigateToActivity?: () => void;
  onNavigateToProfile?: () => void;
}

export function HomeScreen({
  onNavigateToActivity,
  onNavigateToProfile,
}: HomeScreenProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [transactions, setTransactions] = useState<TransactionHistoryItem[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountPickerVisible, setAccountPickerVisible] = useState(false);
  const { hideBalance, toggleHideBalance } = useSettings();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState<boolean>(true);
  // Set when the balance load fails; the card then reads "Balance unavailable".
  const [accountsError, setAccountsError] = useState<string | null>(null);
  // Set when recent activity fails to load; the section then offers a retry.
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  // Bumped by every reload after the first so Currency Watch refetches too.
  const [fxRefreshKey, setFxRefreshKey] = useState(0);
  // Mount and focus can overlap; only the newest load may write state.
  const loadIdRef = useRef(0);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Upcoming scheduled payments & Pending requests
  const [upcomingSchedules, setUpcomingSchedules] = useState<ScheduledPayment[]>([]);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);

  // Dev health check
  const [health, setHealth] = useState<HealthCheck | null>(null);

  const loadData = useCallback(async () => {
    const loadId = ++loadIdRef.current;
    const isCurrent = () => loadId === loadIdRef.current;
    if (loadId > 1) setFxRefreshKey((key) => key + 1);

    try {
      let userId: string;
      try {
        const { data, error } = await supabase.auth.getUser();
        reportNetworkResult(error);
        if (error || !data?.user) {
          if (isCurrent())
            setAccountsError(toUserMessage(error ?? 'Not authenticated', 'load'));
          return;
        }
        userId = data.user.id;
      } catch (err) {
        reportNetworkResult(err);
        if (isCurrent()) setAccountsError(toUserMessage(err, 'load'));
        return;
      }

      try {
        const [profileRes, accountsRes, txRes] = await Promise.all([
          fetchUserProfile(supabase, userId),
          fetchAccountBalances(supabase),
          fetchTransactionHistory(supabase),
        ]);
        if (!isCurrent()) return;

        reportNetworkResult(accountsRes.error || txRes.error || profileRes.error);
        if (profileRes.data) setProfile(profileRes.data);
        if (accountsRes.error || !accountsRes.data) {
          setAccountsError(toUserMessage(accountsRes.error, 'load'));
        } else {
          setAccounts(sortAccounts(accountsRes.data));
          setAccountsError(null);
        }
        if (txRes.error || !txRes.data) {
          setTransactionsError(toUserMessage(txRes.error, 'load'));
        } else {
          setTransactions(txRes.data);
          setTransactionsError(null);
        }
      } catch (err) {
        reportNetworkResult(err);
        if (!isCurrent()) return;
        console.warn('Error loading Home balances:', err);
        setAccountsError(toUserMessage(err, 'load'));
        setTransactionsError(toUserMessage(err, 'load'));
        return;
      }

      try {
        const { count } = await supabase
          .from('payment_requests')
          .select('*', { count: 'exact', head: true })
          .eq('payer_user_id', userId)
          .eq('status', 'pending');
        if (isCurrent()) setPendingRequestsCount(count || 0);
      } catch {
        // Non-critical
      }

      try {
        const { data: schedData } = await supabase
          .from('scheduled_payments')
          .select('*')
          .eq('status', 'active')
          .order('next_run_date', { ascending: true })
          .limit(3);
        if (schedData && isCurrent()) {
          setUpcomingSchedules(schedData as ScheduledPayment[]);
        }
      } catch {
        // Non-critical
      }

      if (__DEV__) {
        // Dev-only diagnostics: a failure here never affects the balance card.
        try {
          const { data: healthData } = await fetchHealthCheck(supabase);
          if (healthData && isCurrent()) setHealth(healthData);
        } catch (err) {
          console.warn('Dev health check failed:', err);
        }
      }
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Focus also fires on first mount, so this is the only load trigger.
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const retryLoad = () => {
    setAccountsError(null);
    setTransactionsError(null);
    setLoading(true);
    loadData();
  };

  const getInitials = (name?: string | null) => {
    if (!name) return 'DB';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const selectedAccount =
    accounts.find((account) => account.account_id === selectedAccountId) ??
    accounts[0] ??
    null;

  const selectAccount = (accountId: string) => {
    setSelectedAccountId(accountId);
    setAccountPickerVisible(false);
  };

  // The ScrollView sits inside Screen's SafeAreaView, which already pads the
  // bottom inset. Content ends 16 pt above the floating tab bar.
  const tabBarTopFromBottom =
    floatingTabBarBottomOffset(insets.bottom) + FLOATING_TAB_BAR_HEIGHT;
  const bottomClearance = tabBarTopFromBottom + spacing.base - insets.bottom;

  if (profile?.status === 'suspended') {
    return <SuspendedScreen profile={profile} userEmail={null} onRefresh={loadData} />;
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: bottomClearance }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header: logo, greeting, profile */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Logo variant="mark" size={32} />
            <View style={styles.greetingText}>
              <Text variant="caption" color={colors.textSecondary}>
                Maayong adlaw,
              </Text>
              <Text variant="title" color={colors.ink} numberOfLines={1}>
                {profile?.full_name?.split(' ')[0] || 'Customer'}
              </Text>
            </View>
          </View>

          <Pressable
            style={styles.avatarHitArea}
            feedbackType="scale"
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            hitSlop={0}
            onPress={onNavigateToProfile}
          >
            <View style={styles.avatar}>
              {profile?.full_name ? (
                <Text variant="bodyStrong" color={colors.primary}>
                  {getInitials(profile.full_name)}
                </Text>
              ) : (
                <User size={TILE_ICON_SIZE} color={colors.primary} />
              )}
            </View>
          </Pressable>
        </View>

        {/* Balance card: the one strong surface on Home */}
        <HomeBalanceCard
          loading={loading}
          error={accountsError}
          accounts={accounts}
          selectedAccount={selectedAccount}
          hideBalance={hideBalance}
          onOpenAccountPicker={() => setAccountPickerVisible(true)}
          onToggleHideBalance={toggleHideBalance}
          onRetry={retryLoad}
        />

        {/* Pending payment requests */}
        {pendingRequestsCount > 0 && (
          <Pressable
            style={styles.requestsBanner}
            onPress={() => navigation.navigate('PaymentRequests')}
            feedbackType="highlight"
            accessibilityRole="button"
            accessibilityLabel={`${pendingRequestsCount} pending payment request${pendingRequestsCount > 1 ? 's' : ''}. Review, pay or decline`}
          >
            <View style={styles.requestsIconBox}>
              <Inbox size={TILE_ICON_SIZE} color={colors.primary} />
            </View>
            <View style={styles.requestsText}>
              <Text variant="bodyStrong" color={colors.ink}>
                {pendingRequestsCount} pending payment request
                {pendingRequestsCount > 1 ? 's' : ''}
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
                Review, pay or decline
              </Text>
            </View>
            <ChevronRight size={TILE_ICON_SIZE} color={colors.textMuted} />
          </Pressable>
        )}

        {/* Actions: 3×2 grid */}
        <ActionTileGrid columns={3}>
          <ActionTile
            label="Transfer"
            color="blue"
            icon={<Send size={TILE_ICON_SIZE} color={actionTileIconColor('blue')} />}
            onPress={() => navigation.navigate('Transfer')}
          />
          <ActionTile
            label="Pay bills"
            color="orange"
            icon={<Zap size={TILE_ICON_SIZE} color={actionTileIconColor('orange')} />}
            onPress={() => navigation.navigate('PayBills')}
          />
          <ActionTile
            label="QR"
            color="primary"
            icon={<QrCode size={TILE_ICON_SIZE} color={actionTileIconColor('primary')} />}
            onPress={() => navigation.navigate('QRHub')}
          />
          <ActionTile
            label="Add money"
            color="green"
            icon={
              <PlusCircle size={TILE_ICON_SIZE} color={actionTileIconColor('green')} />
            }
            onPress={() => navigation.navigate('AddMoney')}
          />
          <ActionTile
            label="Cash out"
            color="red"
            icon={
              <MinusCircle size={TILE_ICON_SIZE} color={actionTileIconColor('red')} />
            }
            onPress={() => navigation.navigate('CashOut')}
          />
          <ActionTile
            label="Schedule"
            color="yellow"
            icon={
              <CalendarClock
                size={TILE_ICON_SIZE}
                color={actionTileIconColor('yellow')}
              />
            }
            onPress={() => navigation.navigate('ScheduledPayments')}
          />
        </ActionTileGrid>

        {/* Currency Watch */}
        <CurrencyWatchCard
          refreshKey={fxRefreshKey}
          onPress={() => navigation.navigate('FXRates')}
        />

        {/* Coming up (only when there are items) */}
        <HomeUpcomingPayments
          schedules={upcomingSchedules}
          hideBalance={hideBalance}
          onOpenSchedules={() => navigation.navigate('ScheduledPayments')}
        />

        {/* Recent activity */}
        <HomeRecentActivity
          loading={loading}
          error={transactionsError}
          onRetry={retryLoad}
          transactions={transactions}
          onNavigateToActivity={onNavigateToActivity}
          onSendMoney={() => navigation.navigate('Transfer')}
          onSelectTransaction={(transaction) =>
            navigation.navigate('Receipt', {
              transactionId: transaction.transaction_id,
              accountId: transaction.account_id,
            })
          }
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

      <AccountPickerSheet
        visible={accountPickerVisible}
        accounts={accounts}
        selectedAccountId={selectedAccount?.account_id ?? null}
        hideBalance={hideBalance}
        onSelect={selectAccount}
        onClose={() => setAccountPickerVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.screenSide,
    gap: spacing.xl,
  },
  header: {
    minHeight: HEADER_HEIGHT,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  brandRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  greetingText: {
    flexShrink: 1,
  },
  avatarHitArea: {
    width: size.touch,
    height: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  requestsIconBox: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsText: {
    flex: 1,
  },
  devCard: {
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
