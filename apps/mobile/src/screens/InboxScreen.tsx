import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  CalendarClock,
  CheckCheck,
  HandCoins,
  MinusCircle,
  PlusCircle,
  Receipt,
  RotateCcw,
  ShieldAlert,
  Sliders,
} from 'lucide-react-native';
import {
  colors,
  radius,
  size,
  spacing,
  fetchNotifications,
  fetchTransactionHistory,
  toUserMessage,
  type Notification,
  type TransactionHistoryItem,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { reportNetworkResult } from '../lib/networkStatus';
import {
  BANTAY_PROTECTIVE_LOCK_NOTIFICATION_TYPE,
  PROTECTIVE_FREEZE_TITLE,
} from '../utils/protectiveFreeze';
import {
  Screen,
  Text,
  EmptyState,
  Skeleton,
  Pressable,
  GroupedList,
  ListHairline,
  LIST_ICON_SIZE,
  LIST_ROW_MIN_HEIGHT,
  groupedListStyles,
  tabScreenBottomClearance,
  useToast,
} from '../components';

const UNREAD_DOT_SIZE = 8;
const HEADER_ICON_SIZE = 18;
const SKELETON_ROWS = 3;

interface InboxScreenProps {
  onUnreadCountChange?: (count: number) => void;
}

/** Sentence-case titles (Wording table: Money sent / Transfer reversed / …). */
const TYPE_TITLES: Record<string, string> = {
  transfer_out: 'Money sent',
  transfer_in: 'Money received',
  deposit: 'Money added',
  withdrawal: 'Cash out',
  bill_payment: 'Bill paid',
  transaction_reversed: 'Transfer reversed',
  balance_adjustment: 'Bank credit',
  account_alert: 'Account update',
  account_opened: 'Account opened',
  payment_request_received: 'Payment request',
  payment_request_paid: 'Request paid',
  payment_request_declined: 'Request declined',
  scheduled_payment_failed: 'Scheduled payment failed',
  scheduled_payment_cancelled: 'Scheduled payment cancelled',
  [BANTAY_PROTECTIVE_LOCK_NOTIFICATION_TYPE]: PROTECTIVE_FREEZE_TITLE,
};

export function notificationTitle(type: string | null): string {
  return (type && TYPE_TITLES[type]) || 'Account update';
}

function notificationIcon(type: string | null): { icon: React.ReactNode; bg: string } {
  const t = type ?? '';
  if (t === 'transfer_in') {
    return {
      icon: <ArrowDownLeft size={LIST_ICON_SIZE} color={colors.primary} />,
      bg: colors.primaryTint,
    };
  }
  if (t === 'transfer_out') {
    return {
      icon: <ArrowUpRight size={LIST_ICON_SIZE} color={colors.blueText} />,
      bg: colors.tintBlue,
    };
  }
  if (t === 'deposit') {
    return {
      icon: <PlusCircle size={LIST_ICON_SIZE} color={colors.primary} />,
      bg: colors.primaryTint,
    };
  }
  if (t === 'withdrawal') {
    return {
      icon: <MinusCircle size={LIST_ICON_SIZE} color={colors.orangeText} />,
      bg: colors.tintOrange,
    };
  }
  if (t === 'bill_payment') {
    return {
      icon: <Receipt size={LIST_ICON_SIZE} color={colors.orangeText} />,
      bg: colors.tintOrange,
    };
  }
  if (t === 'transaction_reversed') {
    return {
      icon: <RotateCcw size={LIST_ICON_SIZE} color={colors.textSecondary} />,
      bg: colors.surfaceSubtle,
    };
  }
  if (t === 'balance_adjustment') {
    return {
      icon: <Sliders size={LIST_ICON_SIZE} color={colors.blueText} />,
      bg: colors.tintBlue,
    };
  }
  if (t.startsWith('payment_request_')) {
    return {
      icon: <HandCoins size={LIST_ICON_SIZE} color={colors.primary} />,
      bg: colors.primaryTint,
    };
  }
  if (t.startsWith('scheduled_payment_')) {
    return {
      icon: <CalendarClock size={LIST_ICON_SIZE} color={colors.blueText} />,
      bg: colors.tintBlue,
    };
  }
  if (t === BANTAY_PROTECTIVE_LOCK_NOTIFICATION_TYPE) {
    return {
      icon: <ShieldAlert size={LIST_ICON_SIZE} color={colors.redText} />,
      bg: colors.tintRed,
    };
  }
  if (t.startsWith('account_')) {
    return {
      icon: <ShieldAlert size={LIST_ICON_SIZE} color={colors.redText} />,
      bg: colors.tintRed,
    };
  }
  return {
    icon: <Bell size={LIST_ICON_SIZE} color={colors.textSecondary} />,
    bg: colors.surfaceSubtle,
  };
}

/**
 * Picks the caller's ledger row for a notification's transaction. Money that
 * arrived (transfer in, money added) opens the credit side; everything else
 * prefers the debit side. Falls back to any row the caller can see.
 */
export function receiptRowFor(
  item: Notification,
  transactionId: string,
  rows: TransactionHistoryItem[]
): TransactionHistoryItem | null {
  const matches = rows.filter((row) => row.transaction_id === transactionId);
  const incoming = item.type === 'transfer_in' || item.type === 'deposit';
  const preferred = incoming ? 'credit' : 'debit';
  return matches.find((row) => row.direction === preferred) ?? matches[0] ?? null;
}

export const RECEIPT_UNAVAILABLE_MESSAGE = "This receipt isn't available.";

/** "2:41 AM" today, otherwise "Nov 8". */
function formatNotificationTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* eslint-disable @typescript-eslint/no-require-imports */
const duriEmptyIllustration = require('../../assets/illustrations/duri-empty-state.png');
const duriErrorIllustration = require('../../assets/illustrations/duri-error-state.png');
/* eslint-enable @typescript-eslint/no-require-imports */

export function InboxScreen({ onUnreadCountChange }: InboxScreenProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState<boolean>(false);
  const loadIdRef = useRef(0);
  const openingReceiptRef = useRef(false);
  const toast = useToast();

  const loadNotifications = useCallback(async () => {
    const loadId = ++loadIdRef.current;
    try {
      const { data, error: loadError } = await fetchNotifications(supabase);
      reportNetworkResult(loadError);
      if (loadId !== loadIdRef.current) return;
      if (loadError || !data) {
        setError(toUserMessage(loadError ?? 'Inbox could not be loaded.', 'load'));
        return;
      }
      setError(null);
      setLoaded(true);
      setNotifications(data);
    } catch (err) {
      reportNetworkResult(err);
      if (loadId === loadIdRef.current) setError(toUserMessage(err, 'load'));
    } finally {
      if (loadId === loadIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // The tab badge follows the list once it has loaded (load, mark one, mark
  // all), always derived from the latest state.
  const unreadCount = notifications.filter((n) => !n.read).length;
  useEffect(() => {
    if (loaded) onUnreadCountChange?.(unreadCount);
  }, [loaded, unreadCount, onUnreadCountChange]);

  // Loads on first focus and refreshes each time the tab regains focus.
  useFocusEffect(
    useCallback(() => {
      void loadNotifications();
    }, [loadNotifications])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void loadNotifications();
  };

  const retry = () => {
    setLoading(true);
    void loadNotifications();
  };

  const markAsRead = async (id: string) => {
    try {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);

      if (!updateError) {
        // Functional update: builds on the latest list, so two quick taps
        // don't undo each other. The badge count follows from the effect below.
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
      }
    } catch (err) {
      console.warn('Error marking notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    setMarkingAll(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { error: updateError } = await supabase
          .from('notifications')
          .update({ read: true })
          .eq('user_id', user.id)
          .eq('read', false);

        if (!updateError) {
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
          toast.show('All notifications marked as read');
        } else {
          toast.show(toUserMessage(updateError), 'error');
        }
      }
    } catch (err) {
      toast.show(toUserMessage(err), 'error');
      console.warn('Error marking all notifications as read:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  /**
   * Opens the receipt for a notification's related transaction. The account id
   * the Receipt route needs comes from the caller's own transaction history:
   * the history RPC is scoped on the server to the caller's accounts, so an id
   * the caller can't see resolves to nothing and no receipt opens.
   */
  const openReceipt = async (item: Notification, transactionId: string) => {
    if (openingReceiptRef.current) return;
    openingReceiptRef.current = true;
    try {
      const { data, error: historyError } = await fetchTransactionHistory(supabase);
      if (historyError || !data) {
        toast.show(toUserMessage(historyError ?? RECEIPT_UNAVAILABLE_MESSAGE), 'error');
        return;
      }
      const row = receiptRowFor(item, transactionId, data);
      if (!row) {
        toast.show(RECEIPT_UNAVAILABLE_MESSAGE, 'error');
        return;
      }
      navigation.navigate('Receipt', {
        transactionId: row.transaction_id,
        accountId: row.account_id,
      });
    } catch (err) {
      toast.show(toUserMessage(err), 'error');
    } finally {
      openingReceiptRef.current = false;
    }
  };

  const openNotification = (item: Notification) => {
    if (!item.read) void markAsRead(item.id);
    // A protective freeze opens the Bantay security center, never a money flow.
    if (item.type === BANTAY_PROTECTIVE_LOCK_NOTIFICATION_TYPE) {
      navigation.navigate('BantaySecurity');
      return;
    }
    // Request notices open Payment requests on the matching tab (unchanged).
    if (item.type?.startsWith('payment_request_')) {
      const initialTab =
        item.type === 'payment_request_paid' || item.type === 'payment_request_declined'
          ? 'outgoing'
          : 'incoming';
      navigation.navigate('PaymentRequests', { initialTab });
      return;
    }
    // Money notices written since the 7B.9 migration carry the transaction id.
    // Older rows and account notices have none: a tap only marks them read.
    if (item.related_transaction_id) {
      void openReceipt(item, item.related_transaction_id);
    }
  };

  const bottomClearance = tabScreenBottomClearance(insets.bottom);
  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.primary}
    />
  );

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
          title="Inbox unavailable"
          description={error}
          descriptionAccessibilityRole="alert"
          illustration={duriErrorIllustration}
          illustrationTestID="inbox-error-mascot"
          actionTitle="Try again"
          onAction={retry}
          refreshControl={refreshControl}
          style={{ paddingBottom: bottomClearance }}
        />
      );
    }

    if (notifications.length === 0) {
      return (
        <EmptyState
          title="You're all caught up"
          description="Money updates, requests and account notices will show here."
          illustration={duriEmptyIllustration}
          illustrationTestID="inbox-empty-mascot"
          refreshControl={refreshControl}
          style={{ paddingBottom: bottomClearance }}
        />
      );
    }

    return (
      <FlatList
        data={[notifications]}
        keyExtractor={() => 'inbox'}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomClearance }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        ListHeaderComponent={
          error ? (
            <View style={styles.inlineError}>
              <Text
                variant="caption"
                color={colors.redText}
                accessibilityRole="alert"
                style={styles.flex}
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
          ) : undefined
        }
        renderItem={({ item: rows }) => (
          <GroupedList>
            {rows.map((item, index) => {
              const title = notificationTitle(item.type);
              const time = formatNotificationTime(item.created_at);
              const { icon, bg } = notificationIcon(item.type);
              const a11yLabel = [item.read ? null : 'Unread', title, item.message, time]
                .filter(Boolean)
                .join(', ');
              return (
                <View key={item.id}>
                  <Pressable
                    onPress={() => openNotification(item)}
                    feedbackType="highlight"
                    accessibilityRole="button"
                    accessibilityLabel={a11yLabel}
                    style={[groupedListStyles.row, styles.row]}
                    testID={`inbox-row-${item.id}`}
                  >
                    <View style={[groupedListStyles.disc, { backgroundColor: bg }]}>
                      {icon}
                    </View>
                    <View style={styles.flex}>
                      <Text
                        variant={item.read ? 'body' : 'bodyStrong'}
                        color={colors.ink}
                        numberOfLines={1}
                        testID={`inbox-title-${item.id}`}
                      >
                        {title}
                      </Text>
                      <Text
                        variant="caption"
                        color={colors.textSecondary}
                        numberOfLines={2}
                      >
                        {item.message}
                      </Text>
                    </View>
                    <View style={styles.trailing}>
                      <Text variant="caption" color={colors.textMuted}>
                        {time}
                      </Text>
                      {!item.read ? (
                        <View
                          style={styles.unreadDot}
                          testID={`inbox-unread-${item.id}`}
                        />
                      ) : null}
                    </View>
                  </Pressable>
                  {index < rows.length - 1 ? <ListHairline /> : null}
                </View>
              );
            })}
          </GroupedList>
        )}
      />
    );
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <Text variant="h1" accessibilityRole="header">
          Inbox
        </Text>
        {unreadCount > 0 ? (
          <Pressable
            onPress={markAllAsRead}
            disabled={markingAll}
            style={styles.markAllButton}
            feedbackType="scale"
            accessibilityRole="button"
            accessibilityLabel="Mark all as read"
            accessibilityState={{ busy: markingAll, disabled: markingAll }}
          >
            <CheckCheck size={HEADER_ICON_SIZE} color={colors.primary} />
            <Text variant="label" color={colors.primary}>
              Mark all read
            </Text>
          </Pressable>
        ) : null}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenSide,
    paddingTop: spacing.base,
    paddingBottom: spacing.md,
  },
  markAllButton: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  listPadding: {
    paddingHorizontal: spacing.screenSide,
  },
  listContent: {
    paddingHorizontal: spacing.screenSide,
    gap: spacing.xl,
  },
  row: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
  },
  flex: {
    flex: 1,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  unreadDot: {
    width: UNREAD_DOT_SIZE,
    height: UNREAD_DOT_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  rowSkeleton: {
    borderRadius: 0,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inlineRetry: {
    minHeight: size.touch,
    justifyContent: 'center',
  },
});
