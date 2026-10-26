import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
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
  type AccountBalance,
  type PaymentRequest,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';
import {
  BottomSheet,
  Text,
  Button,
  Badge,
  EmptyState,
  AmountText,
} from '../components';

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
    // Default to first active account with sufficient balance, or first account
    const sourceAcc =
      accounts.find((a) => a.balance >= req.amount) || accounts[0];

    if (!sourceAcc) {
      alert('No active account found to pay this request.');
      return;
    }

    // Biometric authorization gate
    const authenticated = await confirmBiometricPayment(
      `Pay PHP ${(req.amount / 100).toFixed(2)} to account`
    );
    if (!authenticated) return;

    setActionLoadingId(req.id);
    setStatusMessage(null);

    try {
      const key = generateIdempotencyKey('pay_req');
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
        setStatusMessage(`Payment failed: ${error.message}`);
      } else {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          // Ignore
        }
        setStatusMessage(
          `Successfully paid ${formatCentavosToPHP(req.amount)}!`
        );
        loadRequests();
        if (onPaymentSuccess) onPaymentSuccess();
      }
    } catch (err: any) {
      setStatusMessage(err?.message || 'Payment failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDecline = async (req: PaymentRequest) => {
    setActionLoadingId(req.id);
    try {
      const { error } = await supabase.rpc('decline_payment_request', {
        p_id: req.id,
      });
      if (error) {
        alert(error.message);
      } else {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch {
          // Ignore
        }
        loadRequests();
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to decline request');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancel = async (req: PaymentRequest) => {
    setActionLoadingId(req.id);
    try {
      const { error } = await supabase.rpc('cancel_payment_request', {
        p_id: req.id,
      });
      if (error) {
        alert(error.message);
      } else {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch {
          // Ignore
        }
        loadRequests();
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to cancel request');
    } finally {
      setActionLoadingId(null);
    }
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
              statusMessage.startsWith('Payment failed')
                ? styles.statusBannerError
                : styles.statusBannerSuccess,
            ]}
          >
            <Text
              variant="caption"
              color={
                statusMessage.startsWith('Payment failed')
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
                        <View style={{ marginTop: 2 }}>
                          {getStatusBadge(req.status)}
                        </View>
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
                      <View style={{ marginTop: 2 }}>
                        {getStatusBadge(req.status)}
                      </View>
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
