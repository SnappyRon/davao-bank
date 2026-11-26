import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  AccessibilityInfo,
  View,
  Image,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
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
  LayoutGrid,
  ShieldAlert,
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
import {
  fetchHasOpenHighSecurityEvent,
  fetchSecuritySettings,
} from '../hooks/usePhase8Contracts';
import { useProtectiveFreeze } from '../hooks/useProtectiveFreeze';
import {
  PROTECTIVE_FREEZE_BODY,
  PROTECTIVE_FREEZE_CONFIRM_LABEL,
  PROTECTIVE_FREEZE_HOME_TITLE,
  PROTECTIVE_FREEZE_TILE_LABEL,
  PROTECTIVE_FREEZE_TITLE,
} from '../utils/protectiveFreeze';
import { MASCOT_BANTAY } from '../assets/illustrations';
import { reportNetworkResult } from '../lib/networkStatus';
import { useSettings } from '../context/SettingsContext';
import {
  useToast,
  Screen,
  Text,
  Button,
  ActionTile,
  ActionTileGrid,
  Logo,
  CurrencyWatchCard,
  Pressable,
  AccountPickerSheet,
  actionTileIconColor,
  LIST_ROW_MIN_HEIGHT,
  FLOATING_TAB_BAR_HEIGHT,
  floatingTabBarBottomOffset,
  FloatingKada,
  KADA_SIZE,
} from '../components';
import { SuspendedScreen } from './SuspendedScreen';
import { HomeBalanceCard } from './home/HomeBalanceCard';
import { HomeUpcomingPayments } from './home/HomeUpcomingPayments';
import { HomeRecentActivity } from './home/HomeRecentActivity';
import { fetchBillReminders, type BillReminder } from '../hooks/usePhase8Contracts';
import * as SecureStore from 'expo-secure-store';
import { SHOW_ON_HOME_ACCOUNT_KEY } from './MyAccountsScreen';

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
  const toast = useToast();
  const [isLocked, setIsLocked] = useState(false);
  const [hasHighAlert, setHasHighAlert] = useState(false);
  const protectiveFreeze = useProtectiveFreeze();
  const isFrozen = protectiveFreeze.protective;

  // Announce the freeze once when it appears; Realtime may set it while Home
  // is already open. The banner itself is a polite live region as well.
  useEffect(() => {
    if (!isFrozen || typeof AccessibilityInfo.announceForAccessibility !== 'function') {
      return;
    }
    AccessibilityInfo.announceForAccessibility(PROTECTIVE_FREEZE_BODY);
  }, [isFrozen]);

  const handleActionTilePress = (screen: keyof RootStackParamList) => {
    if (isLocked || isFrozen) {
      toast.show(
        isFrozen ? PROTECTIVE_FREEZE_HOME_TITLE : 'Account locked — Unlock in Bantay',
        'error'
      );
      return;
    }
    navigation.navigate(screen as never);
  };

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

  // Upcoming scheduled payments, bill reminders & Pending requests
  const [upcomingSchedules, setUpcomingSchedules] = useState<ScheduledPayment[]>([]);
  const [billReminders, setBillReminders] = useState<BillReminder[]>([]);
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
        const [profileRes, accountsRes, txRes, savedHomeId, secRes, highAlert] =
          await Promise.all([
            fetchUserProfile(supabase, userId),
            fetchAccountBalances(supabase),
            fetchTransactionHistory(supabase),
            SecureStore.getItemAsync(SHOW_ON_HOME_ACCOUNT_KEY).catch(() => null),
            fetchSecuritySettings().catch(() => ({ data: null, error: null })),
            fetchHasOpenHighSecurityEvent(),
          ]);
        if (secRes?.data?.locked) {
          setIsLocked(true);
        } else {
          setIsLocked(false);
        }
        if (isCurrent()) setHasHighAlert(highAlert);
        if (!isCurrent()) return;

        reportNetworkResult(accountsRes.error || txRes.error || profileRes.error);
        if (profileRes.data) setProfile(profileRes.data);
        if (accountsRes.error || !accountsRes.data) {
          setAccountsError(toUserMessage(accountsRes.error, 'load'));
        } else {
          const sorted = sortAccounts(accountsRes.data);
          setAccounts(sorted);
          setAccountsError(null);
          if (savedHomeId && sorted.some((a) => a.account_id === savedHomeId)) {
            setSelectedAccountId((current) => current ?? savedHomeId);
          }
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

      try {
        const remRes = await fetchBillReminders();
        if (!remRes.error && isCurrent()) {
          setBillReminders(remRes.data);
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
    void protectiveFreeze.refresh();
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

  // One calm Bantay indicator: the locked state replaces the old red banner,
  // so Home never shows two lock indicators at once.
  const bantayLabel = isLocked
    ? 'Account locked — Unlock in Bantay'
    : hasHighAlert
      ? 'Check Bantay: new alert'
      : 'Bantay is watching your account';

  // The ScrollView sits inside Screen's SafeAreaView, which already pads the
  // bottom inset. Content ends 16 pt above the floating tab bar.
  const tabBarTopFromBottom =
    floatingTabBarBottomOffset(insets.bottom) + FLOATING_TAB_BAR_HEIGHT;
  // Leave room for the floating Kada above the bar (spec 7c1d935 §4.1).
  const bottomClearance =
    tabBarTopFromBottom + spacing.base + KADA_SIZE + spacing.base - insets.bottom;

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
          onPressCard={() => navigation.navigate('MyAccounts')}
        />

        {/* A protective freeze replaces the calm row with one unmistakable banner. */}
        {isFrozen ? (
          <View
            style={styles.freezeBanner}
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${PROTECTIVE_FREEZE_HOME_TITLE}. ${PROTECTIVE_FREEZE_TITLE}`}
          >
            <View style={styles.freezeHeader}>
              <ShieldAlert size={TILE_ICON_SIZE} color={colors.redText} />
              <Text
                variant="bodyStrong"
                color={colors.redText}
                accessibilityRole="header"
              >
                {PROTECTIVE_FREEZE_HOME_TITLE}
              </Text>
            </View>
            <Text variant="caption" color={colors.ink}>
              {PROTECTIVE_FREEZE_TITLE}. {PROTECTIVE_FREEZE_BODY}
            </Text>
            <Button
              title={PROTECTIVE_FREEZE_CONFIRM_LABEL}
              accessibilityLabel={PROTECTIVE_FREEZE_CONFIRM_LABEL}
              onPress={() => navigation.navigate('BantaySecurity')}
            />
          </View>
        ) : (
          /* One calm Bantay indicator, under the balance card. No balance info. */
          <Pressable
            style={[
              styles.bantayRow,
              isLocked ? styles.bantayRowLocked : null,
              !isLocked && hasHighAlert ? styles.bantayRowAlert : null,
            ]}
            onPress={() => navigation.navigate('BantaySecurity')}
            feedbackType="highlight"
            accessibilityRole="button"
            accessibilityLabel={bantayLabel}
          >
            <Image
              source={MASCOT_BANTAY}
              style={styles.bantayAvatar}
              accessible={false}
            />
            <View style={styles.bantayText}>
              <Text
                variant="bodyStrong"
                color={isLocked ? colors.redText : colors.ink}
                accessibilityRole="text"
              >
                {bantayLabel}
              </Text>
            </View>
            <ChevronRight size={TILE_ICON_SIZE} color={colors.textMuted} />
          </Pressable>
        )}

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
            label={isFrozen ? PROTECTIVE_FREEZE_TILE_LABEL : 'Transfer'}
            color="blue"
            icon={<Send size={TILE_ICON_SIZE} color={actionTileIconColor('blue')} />}
            disabled={isFrozen}
            onPress={() => handleActionTilePress('Transfer')}
          />
          <ActionTile
            label={isFrozen ? PROTECTIVE_FREEZE_TILE_LABEL : 'Pay bills'}
            color="orange"
            icon={<Zap size={TILE_ICON_SIZE} color={actionTileIconColor('orange')} />}
            disabled={isFrozen}
            onPress={() => handleActionTilePress('PayBills')}
          />
          <ActionTile
            label={isFrozen ? PROTECTIVE_FREEZE_TILE_LABEL : 'QR'}
            color="primary"
            icon={<QrCode size={TILE_ICON_SIZE} color={actionTileIconColor('primary')} />}
            disabled={isFrozen}
            onPress={() => handleActionTilePress('QRHub')}
          />
          <ActionTile
            label={isFrozen ? PROTECTIVE_FREEZE_TILE_LABEL : 'Add money'}
            color="green"
            icon={
              <PlusCircle size={TILE_ICON_SIZE} color={actionTileIconColor('green')} />
            }
            disabled={isFrozen}
            onPress={() => handleActionTilePress('AddMoney')}
          />
          <ActionTile
            label={isFrozen ? PROTECTIVE_FREEZE_TILE_LABEL : 'Cash out'}
            color="red"
            icon={
              <MinusCircle size={TILE_ICON_SIZE} color={actionTileIconColor('red')} />
            }
            disabled={isFrozen}
            onPress={() => handleActionTilePress('CashOut')}
          />
          <ActionTile
            label={isFrozen ? PROTECTIVE_FREEZE_TILE_LABEL : 'Schedule'}
            color="yellow"
            icon={
              <CalendarClock
                size={TILE_ICON_SIZE}
                color={actionTileIconColor('yellow')}
              />
            }
            disabled={isFrozen}
            onPress={() => handleActionTilePress('ScheduledPayments')}
          />
        </ActionTileGrid>

        {/* More services hub (Phase 9 · 9A) */}
        <Pressable
          style={styles.moreServicesRow}
          onPress={() => navigation.navigate('MoreServices')}
          feedbackType="highlight"
          accessibilityRole="button"
          accessibilityLabel="More services, FX converter, requests and calculators"
          testID="home-more-services-row"
        >
          <View style={styles.moreServicesIconBox}>
            <LayoutGrid size={TILE_ICON_SIZE} color={colors.primary} />
          </View>
          <View style={styles.moreServicesText}>
            <View style={styles.moreServicesTitleRow}>
              <Text
                variant="bodyStrong"
                color={colors.ink}
                style={styles.moreServicesTitle}
                maxFontSizeMultiplier={1.4}
              >
                More services
              </Text>
            </View>
            <Text
              variant="caption"
              color={colors.textSecondary}
              maxFontSizeMultiplier={1.4}
            >
              FX converter, requests and calculators
            </Text>
          </View>
          <ChevronRight size={TILE_ICON_SIZE} color={colors.textMuted} />
        </Pressable>

        {/* Currency Watch */}
        <CurrencyWatchCard
          refreshKey={fxRefreshKey}
          onPress={() => navigation.navigate('FXRates')}
        />

        {/* Coming up (only when there are items) */}
        <HomeUpcomingPayments
          schedules={upcomingSchedules}
          billReminders={billReminders}
          hideBalance={hideBalance}
          onOpenSchedules={() => navigation.navigate('ScheduledPayments')}
          onOpenBillReminder={(reminder) =>
            navigation.navigate('PayBills', {
              billerId: reminder.biller_id,
              reference: reminder.reference,
            })
          }
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

      {/* Home-only: no Kada on money flows, Bantay screen or other tabs. */}
      <FloatingKada
        locked={isLocked || isFrozen}
        protective={isFrozen}
        onOpenBantay={() => navigation.navigate('BantaySecurity')}
        onOpenChat={() => navigation.navigate('BantayChat')}
      />

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
  freezeBanner: {
    gap: spacing.sm,
    padding: spacing.base,
    backgroundColor: colors.tintRed,
    borderWidth: 1,
    borderColor: colors.redText,
    borderRadius: radius.md,
  },
  freezeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bantayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: size.touch,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  bantayRowLocked: {
    backgroundColor: colors.tintRed,
    borderColor: colors.redText,
  },
  bantayRowAlert: {
    borderColor: colors.orangeText,
  },
  bantayAvatar: {
    width: 28,
    height: 28,
  },
  bantayText: {
    flex: 1,
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
  moreServicesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: LIST_ROW_MIN_HEIGHT,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingLeft: spacing.base,
    // Reserve the Kada's resting lane so its frame and dismiss X never cover
    // this row's tappable content (captain review, 2026-11-26).
    paddingRight: KADA_SIZE + spacing.base,
  },
  moreServicesIconBox: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreServicesText: {
    flex: 1,
    gap: spacing.xs,
  },
  moreServicesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  moreServicesTitle: {
    flexShrink: 1,
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
