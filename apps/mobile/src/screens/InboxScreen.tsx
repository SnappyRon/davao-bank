import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import React, { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
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
  toUserMessage,
  type Notification,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
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
} from '../components';

const UNREAD_DOT_SIZE = 8;
const HEADER_ICON_SIZE = 18;
const EMPTY_ICON_SIZE = 36;
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

/** "2:41 AM" today, otherwise "Nov 8". */
function formatNotificationTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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

  const loadNotifications = useCallback(async () => {
    const loadId = ++loadIdRef.current;
    try {
      const { data, error: loadError } = await fetchNotifications(supabase);
      if (loadId !== loadIdRef.current) return;
      if (loadError || !data) {
        setError(toUserMessage(loadError ?? 'Inbox could not be loaded.'));
        return;
      }
      setError(null);
      setLoaded(true);
      setNotifications(data);
      onUnreadCountChange?.(data.filter((n) => !n.read).length);
    } catch (err) {
      if (loadId === loadIdRef.current) setError(toUserMessage(err));
    } finally {
      if (loadId === loadIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [onUnreadCountChange]);

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
        const next = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
        setNotifications(next);
        onUnreadCountChange?.(next.filter((n) => !n.read).length);
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
          onUnreadCountChange?.(0);
        }
      }
    } catch (err) {
      console.warn('Error marking all notifications as read:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  const openNotification = (item: Notification) => {
    if (!item.read) void markAsRead(item.id);
    if (item.type?.startsWith('payment_request_')) {
      const initialTab =
        item.type === 'payment_request_paid' || item.type === 'payment_request_declined'
          ? 'outgoing'
          : 'incoming';
      navigation.navigate('PaymentRequests', { initialTab });
    }
    // TODO(owner decision): transaction notifications cannot open a receipt
    // yet. The notifications table has no related transaction id, so there is
    // nothing reliable to link to; matching by amount or time is not allowed.
    // Until the owner decides (e.g. a related_id column), a tap only marks the
    // notification as read.
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
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
          icon={<AlertCircle size={EMPTY_ICON_SIZE} color={colors.redText} />}
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
          icon={<Bell size={EMPTY_ICON_SIZE} color={colors.textMuted} />}
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
            <View style={styles.inlineError} accessibilityRole="alert">
              <Text variant="caption" color={colors.redText} style={styles.flex}>
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
