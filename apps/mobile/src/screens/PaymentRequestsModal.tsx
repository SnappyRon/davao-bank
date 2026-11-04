import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Send,
  Inbox,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  formatCentavosToPHP,
  generateIdempotencyKey,
  toUserMessage,
  type AccountBalance,
  type PaymentRequest,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';
import { BottomSheet, Text, Button, Badge, EmptyState, AmountText } from '../components';

interface PaymentRequestsModalProps {
  visible: boolean;
  onClose: () => void;
  accounts: AccountBalance[];
  onPaymentSuccess?: () => void;
}

type RequestTab = 'incoming' | 'outgoing';

export function PaymentRequestsModal({
  visible,
  onClose,
  accounts,
  onPaymentSuccess,
}: PaymentRequestsModalProps) {
  const { confirmBiometricPayment, hideBalance } = useSettings();
  const [tab, setTab] = useState<RequestTab>('incoming');
  const [incomingRequests, setIncomingRequests] = useState<PaymentRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const [inRes, outRes] = await Promise.all([
        supabase
          .from('payment_requests')
          .select('*')
          .eq('payer_user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('payment_requests')
          .select('*')
          .eq('requester_id', user.id)
          .order('created_at', { ascending: false }),
      ]);

      if (inRes.data) setIncomingRequests(inRes.data as PaymentRequest[]);
      if (outRes.data) setOutgoingRequests(outRes.data as PaymentRequest[]);
    } catch (err) {
      console.warn('Error loading payment requests:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setStatusMessage(null);
      loadRequests();
    }
  }, [visible, loadRequests]);

  const onRefresh = () => {
    setRefreshing(true);
    loadRequests();
  };

  const handlePay = async (req: PaymentRequest) => {
    if (actionLoadingId) return;

    // Default to first active account with sufficient balance, or first account
    const sourceAcc = accounts.find((a) => a.balance >= req.amount) || accounts[0];

    if (!sourceAcc) {
      setStatusMessage('No active account found to pay this request.');
      return;
    }

    // Set loading state BEFORE authorization to prevent double-tap prompts (§0.9 item 6)
    setActionLoadingId(req.id);
    setStatusMessage(null);

    // Generate idempotency key once before confirmation
    const key = generateIdempotencyKey('pay_req');

    // Biometric / Password authorization gate (§Fix 6)
    const authenticated = await confirmBiometricPayment({
      title: 'Authorize Payment Request',
      message: `Confirm payment of ₱${(req.amount / 100).toFixed(2)} to account ${req.requester_account}`,
    });
    if (!authenticated.success) {
      setActionLoadingId(null);
      if (authenticated.cancelled) {
        setStatusMessage('Payment authorization was cancelled.');
      } else {
        setStatusMessage(authenticated.error || 'Payment authorization failed.');
      }
      return;
    }

    try {
      const { error } = await supabase.rpc('pay_payment_request', {
        p_request_id: req.id,
        p_from_account: sourceAcc.account_id,
        p_idempotency_key: key,
      });

      if (error) {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch {
          // Ignore
        }
        setStatusMessage(toUserMessage(error.message, sourceAcc.balance));
      } else {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          // Ignore
        }
        setStatusMessage(`Successfully paid ${formatCentavosToPHP(req.amount)}!`);
        loadRequests();
        if (onPaymentSuccess) onPaymentSuccess();
      }
    } catch (err: any) {
      setStatusMessage(toUserMessage(err?.message, sourceAcc.balance));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDecline = (req: PaymentRequest) => {
    if (actionLoadingId) return;
    setActionLoadingId(req.id);
    Alert.alert('Decline this request?', 'The requester will see it as declined.', [
      {
        text: 'Keep',
        style: 'cancel',
        onPress: () => setActionLoadingId(null),
      },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.rpc('decline_payment_request', {
              p_id: req.id,
            });
            if (error) {
              setStatusMessage(toUserMessage(error.message));
            } else {
              try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              } catch {
                // Ignore
              }
              loadRequests();
            }
          } catch (err: any) {
            setStatusMessage(toUserMessage(err?.message));
          } finally {
            setActionLoadingId(null);
          }
        },
      },
    ]);
  };

  const handleCancel = (req: PaymentRequest) => {
    if (actionLoadingId) return;
    setActionLoadingId(req.id);
    Alert.alert('Cancel this request?', undefined, [
      {
        text: 'Keep',
        style: 'cancel',
        onPress: () => setActionLoadingId(null),
      },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.rpc('cancel_payment_request', {
              p_id: req.id,
            });
            if (error) {
              setStatusMessage(toUserMessage(error.message));
            } else {
              try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              } catch {
                // Ignore
              }
              loadRequests();
            }
          } catch (err: any) {
            setStatusMessage(toUserMessage(err?.message));
          } finally {
            setActionLoadingId(null);
          }
        },
      },
    ]);
  };

  const getStatusBadge = (status: PaymentRequest['status']) => {
    switch (status) {
      case 'pending':
        return <Badge label="Pending" variant="warning" />;
      case 'paid':
        return <Badge label="Paid" variant="success" />;
      case 'declined':
        return <Badge label="Declined" variant="danger" />;
      case 'cancelled':
        return <Badge label="Cancelled" variant="neutral" />;
      case 'expired':
        return <Badge label="Expired" variant="neutral" />;
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      dismissible={!actionLoadingId}
      title="Payment Requests"
    >
      <View style={styles.container}>
        {/* Tab switch */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, tab === 'incoming' && styles.tabItemActive]}
            onPress={() => setTab('incoming')}
            activeOpacity={0.7}
          >
            <ArrowDownLeft
              size={18}
              color={tab === 'incoming' ? colors.primary : colors.textSecondary}
            />
            <Text
              variant="bodyStrong"
              color={tab === 'incoming' ? colors.primary : colors.textSecondary}
            >
              Incoming ({incomingRequests.filter((r) => r.status === 'pending').length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, tab === 'outgoing' && styles.tabItemActive]}
            onPress={() => setTab('outgoing')}
            activeOpacity={0.7}
          >
            <ArrowUpRight
              size={18}
              color={tab === 'outgoing' ? colors.primary : colors.textSecondary}
            />
            <Text
              variant="bodyStrong"
              color={tab === 'outgoing' ? colors.primary : colors.textSecondary}
            >
              Outgoing ({outgoingRequests.length})
            </Text>
          </TouchableOpacity>
        </View>

        {statusMessage && (
          <View
            style={[
              styles.statusBanner,
              statusMessage.toLowerCase().includes('fail') ||
              statusMessage.toLowerCase().includes('error') ||
              statusMessage.toLowerCase().includes('went wrong')
                ? styles.statusBannerError
                : styles.statusBannerSuccess,
            ]}
          >
            <Text
              variant="caption"
              color={
                statusMessage.toLowerCase().includes('fail') ||
                statusMessage.toLowerCase().includes('error') ||
                statusMessage.toLowerCase().includes('went wrong')
                  ? colors.error
                  : colors.primary
              }
              style={{ fontWeight: '700' }}
            >
              {statusMessage}
            </Text>
          </View>
        )}

        <ScrollView
          style={styles.listArea}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {loading ? (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ marginTop: spacing.xl }}
            />
          ) : tab === 'incoming' ? (
            incomingRequests.length === 0 ? (
              <EmptyState
                title="No incoming requests"
                description="When another Davao Bank customer requests money from you, it will appear here."
              />
            ) : (
              <View style={styles.itemsList}>
                {incomingRequests.map((req) => (
                  <View key={req.id} style={styles.requestCard}>
                    <View style={styles.cardHeader}>
                      <View style={styles.requesterInfo}>
                        <Text variant="caption" color={colors.textSecondary}>
                          REQUEST FROM
                        </Text>
                        <Text variant="bodyStrong" color={colors.ink} tabularNums>
                          Account {req.payer_account_number ? '••••' : ''}
                        </Text>
                        {req.note ? (
                          <Text variant="caption" color={colors.textSecondary}>
                            "{req.note}"
                          </Text>
                        ) : null}
                      </View>

                      <View style={styles.amountInfo}>
                        <AmountText
                          amountCentavos={req.amount}
                          hidden={hideBalance}
                          variant="title"
                          color={colors.ink}
                          showSign={false}
                        />
                        <View style={{ marginTop: 2 }}>{getStatusBadge(req.status)}</View>
                      </View>
                    </View>

                    {req.status === 'pending' && (
                      <View style={styles.cardActions}>
                        <Button
                          title="Decline"
                          variant="ghost"
                          disabled={actionLoadingId === req.id}
                          onPress={() => handleDecline(req)}
                        />
                        <Button
                          title="Pay Now"
                          variant="primary"
                          loading={actionLoadingId === req.id}
                          onPress={() => handlePay(req)}
                        />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )
          ) : outgoingRequests.length === 0 ? (
            <EmptyState
              title="No outgoing requests"
              description="Payment requests you send to other Davao Bank users will be tracked here."
            />
          ) : (
            <View style={styles.itemsList}>
              {outgoingRequests.map((req) => (
                <View key={req.id} style={styles.requestCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.requesterInfo}>
                      <Text variant="caption" color={colors.textSecondary}>
                        REQUESTED TO
                      </Text>
                      <Text variant="bodyStrong" color={colors.ink} tabularNums>
                        Account {req.payer_account_number}
                      </Text>
                      {req.note ? (
                        <Text variant="caption" color={colors.textSecondary}>
                          "{req.note}"
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.amountInfo}>
                      <AmountText
                        amountCentavos={req.amount}
                        hidden={hideBalance}
                        variant="title"
                        color={colors.ink}
                        showSign={false}
                      />
                      <View style={{ marginTop: 2 }}>{getStatusBadge(req.status)}</View>
                    </View>
                  </View>

                  {req.status === 'pending' && (
                    <View style={styles.cardActionsSingle}>
                      <Button
                        title="Cancel Request"
                        variant="destructive"
                        disabled={actionLoadingId === req.id}
                        onPress={() => handleCancel(req)}
                      />
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing['2xl'],
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.xs,
    marginBottom: spacing.base,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  tabItemActive: {
    backgroundColor: colors.surface,
    elevation: 1,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  statusBanner: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.base,
  },
  statusBannerSuccess: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.primaryTint,
  },
  statusBannerError: {
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.error,
  },
  listArea: {
    maxHeight: 460,
  },
  itemsList: {
    gap: spacing.base,
    paddingBottom: spacing.base,
  },
  requestCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  requesterInfo: {
    flex: 1,
    gap: 2,
  },
  amountInfo: {
    alignItems: 'flex-end',
    gap: 4,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cardActionsSingle: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
