import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Bell, CheckCheck } from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  fetchNotifications,
  type Notification,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { Screen, Text, Card, EmptyState, Skeleton } from '../components';

interface InboxScreenProps {
  onUnreadCountChange?: (count: number) => void;
}

export function InboxScreen({ onUnreadCountChange }: InboxScreenProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [markingAll, setMarkingAll] = useState<boolean>(false);

  const loadNotifications = useCallback(async () => {
    try {
      const { data, error } = await fetchNotifications(supabase);
      if (!error && data) {
        setNotifications(data);
        const unreadCount = data.filter((n) => !n.read).length;
        if (onUnreadCountChange) {
          onUnreadCountChange(unreadCount);
        }
      }
    } catch (err) {
      console.warn('Failed to load notifications:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onUnreadCountChange]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const onRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const markAsRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);

      if (!error) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
        const remainingUnread = notifications.filter(
          (n) => n.id !== id && !n.read
        ).length;
        if (onUnreadCountChange) {
          onUnreadCountChange(remainingUnread);
        }
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
        const { error } = await supabase
          .from('notifications')
          .update({ read: true })
          .eq('user_id', user.id)
          .eq('read', false);

        if (!error) {
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
          if (onUnreadCountChange) {
            onUnreadCountChange(0);
          }
        }
      }
    } catch (err) {
      console.warn('Error marking all notifications as read:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text variant="h1">Inbox</Text>
          {unreadCount > 0 ? (
            <TouchableOpacity
              onPress={markAllAsRead}
              disabled={markingAll}
              style={styles.markAllButton}
              activeOpacity={0.8}
            >
              <CheckCheck size={18} color={colors.primary} />
              <Text variant="bodyStrong" color={colors.primary}>
                Mark all read
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.skeletonContainer}>
          <Skeleton width="100%" height={80} style={styles.skeletonItem} />
          <Skeleton width="100%" height={80} style={styles.skeletonItem} />
          <Skeleton width="100%" height={80} style={styles.skeletonItem} />
        </View>
      ) : notifications.length === 0 ? (
        <EmptyState
          title="Inbox is clear"
          description="Security alerts, transaction notices, and account updates will appear here."
          icon={<Bell size={36} color={colors.textMuted} />}
          style={styles.emptyContainer}
        />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => {
            const timeStr = new Date(item.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            const displayTitle = item.type
              ? item.type.replace(/_/g, ' ').toUpperCase()
              : 'ACCOUNT ALERT';

            return (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => !item.read && markAsRead(item.id)}
              >
                <Card
                  variant={item.read ? 'default' : 'subtle'}
                  style={[
                    styles.notificationCard,
                    !item.read ? styles.unreadCard : undefined,
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.titleRow}>
                      {!item.read ? <View style={styles.unreadDot} /> : null}
                      <Text
                        variant="bodyStrong"
                        color={colors.ink}
                        style={styles.cardTitle}
                      >
                        {displayTitle}
                      </Text>
                    </View>
                    <Text variant="caption" color={colors.textMuted}>
                      {timeStr}
                    </Text>
                  </View>
                  <Text
                    variant="body"
                    color={colors.textSecondary}
                    style={styles.cardMessage}
                  >
                    {item.message}
                  </Text>
                </Card>
              </TouchableOpacity>
            );
          }}
        />
      )}
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
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
  },
  listContent: {
    paddingHorizontal: spacing.screenSide,
    paddingBottom: spacing['3xl'],
    gap: spacing.sm,
  },
  notificationCard: {
    padding: spacing.base,
    borderRadius: radius.md,
  },
  unreadCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    backgroundColor: colors.surface,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    marginRight: spacing.sm,
  },
  cardTitle: {
    flex: 1,
  },
  cardMessage: {
    lineHeight: 20,
  },
  skeletonContainer: {
    padding: spacing.screenSide,
    gap: spacing.md,
  },
  skeletonItem: {
    borderRadius: radius.md,
  },
  emptyContainer: {
    marginTop: spacing['3xl'],
    paddingHorizontal: spacing.screenSide,
  },
});
