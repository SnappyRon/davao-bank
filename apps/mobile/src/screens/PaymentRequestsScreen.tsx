import { useConfirmSheet } from '../hooks/useConfirmSheet';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { StepUpSetupLink } from '../components/StepUpSetupLink';
import { retryStepUp } from '../utils/stepUpRetry';
import { useTotpPrompt } from '../context/PasswordPromptContext';
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, RefreshControl } from 'react-native';
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
  fetchAccountBalances,
  generateIdempotencyKey,
  toUserMessage,
  type AccountBalance,
  type PaymentRequest,
  typography,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { reportNetworkResult } from '../lib/networkStatus';
import { MASCOT_EMPTY, MASCOT_ERROR } from '../assets/illustrations';
import { useSettings } from '../context/SettingsContext';
import {
  FeatureScreen,
  Text,
  Button,
  Badge,
  EmptyState,
  Skeleton,
  AmountText,
  Pressable,
  ReviewCard,
  AccountPickerSheet,
  formatAccountLabel,
  useToast,
} from '../components';
import { commitButtonLabel } from '../utils/moneyFlow';
import {
  isConfirmedRejection,
  resultRows,
  type ResultResponse,
} from '../utils/resultReceipt';
import { ResultView } from '../components/ResultView';
import { useInFlightGuard } from '../hooks/useInFlightGuard';

type RequestTab = 'incoming' | 'outgoing';

export function PaymentRequestsScreen() {
  const { showConfirmation, confirmSheet } = useConfirmSheet();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'PaymentRequests'>>();
  const toast = useToast();
  const onClose = () => navigation.goBack();
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);
  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    const { data, error } = await fetchAccountBalances(supabase);
    reportNetworkResult(error);
    if (error) setAccountError(toUserMessage(error));
    else {
      setAccounts(data || []);
      setAccountError(null);
    }
    setAccountsLoading(false);
  }, []);
  const onPaymentSuccess = loadAccounts;

  const promptTotp = useTotpPrompt();
  const { confirmBiometricPayment, hideBalance } = useSettings();
  const [tab, setTab] = useState<RequestTab>(route.params?.initialTab ?? 'incoming');
  const [incomingRequests, setIncomingRequests] = useState<PaymentRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  // Explicit banner kind (never guessed from the text): only a confirmed
  // payment is a success; every other message is an error.
  const [statusKind, setStatusKind] = useState<'success' | 'error'>('error');
  const guardPay = useInFlightGuard();
  // Spec 7B.4: paying a request goes through the standard Review first.
  const [resultError, setResultError] = useState<unknown>(null);
  const [paymentResult, setPaymentResult] = useState<ResultResponse | null>(null);
  const [reviewRequest, setReviewRequest] = useState<PaymentRequest | null>(null);
  const [payFromId, setPayFromId] = useState<string | null>(null);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);

  useEffect(() => {
    if (route.params?.initialTab) {
      setTab(route.params.initialTab);
    }
  }, [route.params?.initialTab]);

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

      const reqError = inRes.error || outRes.error;
      reportNetworkResult(reqError);
      if (reqError) {
        setRequestsError(toUserMessage(reqError));
      } else {
        if (inRes.data) setIncomingRequests(inRes.data as PaymentRequest[]);
        if (outRes.data) setOutgoingRequests(outRes.data as PaymentRequest[]);
        setRequestsError(null);
      }
    } catch (err) {
      reportNetworkResult(err);
      console.warn('Error loading payment requests:', err);
      setRequestsError(toUserMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setStatusMessage(null);
    void loadAccounts();
    void loadRequests();
  }, [loadAccounts, loadRequests]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadAccounts();
    void loadRequests();
  };

  const handlePay = async (
    req: PaymentRequest,
    chosenAccount?: AccountBalance
  ): Promise<boolean> => {
    if (actionLoadingId) return false;

    // The account chosen on Review; otherwise the first account with enough balance, or the first account
    const sourceAcc =
      chosenAccount ?? (accounts.find((a) => a.balance >= req.amount) || accounts[0]);

    if (!sourceAcc) {
      setStatusMessage('No active account found to pay this request.');
      return false;
    }

    // Set loading state BEFORE authorization to prevent double-tap prompts (§0.9 item 6)
    setActionLoadingId(req.id);
    setStatusMessage(null);

    // Generate idempotency key once before confirmation
    const key = generateIdempotencyKey('pay_req');

    // Biometric / Password authorization gate (§Fix 6)
    const authenticated = await confirmBiometricPayment({
      title: 'Authorize payment request',
      // Never show the requester's account UUID; accounts are written "Savings •• 8921".
      message: `Confirm payment of ${formatCentavosToPHP(req.amount)} from ${formatAccountLabel(sourceAcc)} for this request`,
    });
    if (!authenticated.success) {
      setActionLoadingId(null);
      if (authenticated.cancelled) {
        setStatusMessage('Not authorized. Nothing was sent.');
      } else {
        setStatusMessage(authenticated.error || 'Payment authorization failed.');
      }
      return false;
    }

    let paid = false;
    try {
      const { data, error } = await retryStepUp(
        () =>
          supabase.rpc('pay_payment_request', {
            p_request_id: req.id,
            p_from_account: sourceAcc.account_id,
            p_idempotency_key: key,
          }),
        promptTotp
      );

      if (error) {
        setResultError(error);
        setStatusMessage(toUserMessage(error.message, sourceAcc.balance));
      } else {
        setPaymentResult(
          data?.transfer_result ?? (data ? { transaction_id: data.transaction_id } : {})
        );
        setStatusMessage(`Paid ${formatCentavosToPHP(req.amount)}.`);
        paid = true;
        loadRequests();
        if (onPaymentSuccess) onPaymentSuccess();
      }
    } catch (err: any) {
      setStatusMessage(toUserMessage(err?.message, sourceAcc.balance));
    } finally {
      setActionLoadingId(null);
    }
    return paid;
  };

  const handleDecline = (req: PaymentRequest) => {
    if (actionLoadingId) return;
    setActionLoadingId(req.id);
    showConfirmation({
      title: 'Decline this request?',
      message: 'The requester will see it as declined.',
      confirmLabel: 'Decline',
      cancelLabel: 'Keep',
      destructive: true,
      onCancel: () => setActionLoadingId(null),
      onConfirm: async () => {
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
            toast.show('Request declined');
            loadRequests();
          }
        } catch (err: any) {
          setStatusMessage(toUserMessage(err?.message));
        } finally {
          setActionLoadingId(null);
        }
      },
    });
  };
  const handleCancel = (req: PaymentRequest) => {
    if (actionLoadingId) return;
    setActionLoadingId(req.id);
    showConfirmation({
      title: 'Cancel this request?',
      message: undefined,
      confirmLabel: 'Cancel request',
      cancelLabel: 'Keep',
      destructive: true,
      onCancel: () => setActionLoadingId(null),
      onConfirm: async () => {
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
            toast.show('Request declined');
            loadRequests();
          }
        } catch (err: any) {
          setStatusMessage(toUserMessage(err?.message));
        } finally {
          setActionLoadingId(null);
        }
      },
    });
  };
  const openPayReview = (req: PaymentRequest) => {
    if (actionLoadingId) return;
    const defaultAccount = accounts.find((a) => a.balance >= req.amount) || accounts[0];
    setStatusMessage(null);
    setStatusKind('error');
    setPayFromId(defaultAccount?.account_id ?? null);
    setReviewRequest(req);
  };

  const closePayReview = () => {
    setReviewRequest(null);
    setStatusMessage(null);
  };

  const reviewAccount = accounts.find((a) => a.account_id === payFromId) ?? accounts[0];
  const reviewBalanceShort =
    reviewRequest && reviewAccount ? reviewAccount.balance < reviewRequest.amount : false;

  const confirmPayFromReview = () =>
    guardPay(async () => {
      if (!reviewRequest || reviewBalanceShort) return;
      setStatusKind('error');
      const paid = await handlePay(reviewRequest, reviewAccount);
      if (paid) {
        // Success: back to the list, where the banner confirms the payment.
        setStatusKind('success');
        setReviewRequest(null);
      }
      // Not authorized / failed: stay on Review with the same account; the
      // message shows inline above the card.
    });

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
    <FeatureScreen
      isProcessing={Boolean(actionLoadingId)}
      title={
        paymentResult
          ? 'Payment result'
          : reviewRequest
            ? 'Pay request'
            : 'Payment requests'
      }
      // Review is a second step: Back returns to the list (no caption shown).
      step={reviewRequest ? 2 : undefined}
      onPrevStep={closePayReview}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        reviewRequest ? undefined : (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        )
      }
      footer={
        reviewRequest && !paymentResult && !isConfirmedRejection(resultError) ? (
          <Button
            title={commitButtonLabel(
              'pay',
              reviewRequest.amount,
              actionLoadingId === reviewRequest.id
            )}
            loading={actionLoadingId === reviewRequest.id}
            disabled={!reviewAccount || reviewBalanceShort}
            onPress={() => void confirmPayFromReview()}
          />
        ) : undefined
      }
    >
      {isConfirmedRejection(resultError) ? (
        <ResultView
          outcome="failed"
          title="Not sent"
          onDone={() => setResultError(null)}
        />
      ) : paymentResult ? (
        <ResultView
          outcome="completed"
          title="Payment sent"
          amountCentavos={paymentResult.amount}
          hideBalance={hideBalance}
          details={resultRows(paymentResult)}
          shareReceipt
          contextualActionTitle="View requests"
          onContextualAction={() => {
            setPaymentResult(null);
            setStatusMessage(null);
          }}
          onDone={() => {
            setPaymentResult(null);
            setStatusMessage(null);
          }}
        />
      ) : reviewRequest ? (
        <View style={styles.reviewContainer}>
          {reviewBalanceShort && reviewAccount ? (
            <View style={[styles.statusBanner, styles.statusBannerError]}>
              <Text
                variant="caption"
                color={colors.error}
                accessibilityRole="alert"
                style={styles.statusBannerText}
              >
                {`Not enough balance in ${formatAccountLabel(reviewAccount)}. Choose another account.`}
              </Text>
            </View>
          ) : statusMessage ? (
            <View style={[styles.statusBanner, styles.statusBannerError]}>
              <Text
                variant="caption"
                color={colors.error}
                accessibilityRole="alert"
                style={styles.statusBannerText}
              >
                {statusMessage}
              </Text>
            </View>
          ) : null}
          <ReviewCard
            eyebrow="You're paying"
            amountCentavos={reviewRequest.amount}
            rows={[
              {
                label: 'From',
                value: reviewAccount ? formatAccountLabel(reviewAccount) : '',
                onPress:
                  accounts.length >= 2 && !actionLoadingId
                    ? () => setAccountPickerOpen(true)
                    : undefined,
              },
              { label: 'To', value: 'Payment request' },
              { label: 'Note', value: reviewRequest.note?.trim() ?? '' },
              { label: 'When', value: 'Now' },
              {
                label: 'Balance after',
                // Left out when the account is short (the error above says so).
                value:
                  reviewAccount && !reviewBalanceShort
                    ? hideBalance
                      ? '₱••••••'
                      : formatCentavosToPHP(reviewAccount.balance - reviewRequest.amount)
                    : '',
                valueAccessibilityLabel: hideBalance ? 'Amount hidden' : undefined,
              },
              { label: 'Fee', value: 'Free' },
            ]}
          />
          <AccountPickerSheet
            visible={accountPickerOpen}
            accounts={accounts}
            selectedAccountId={reviewAccount?.account_id ?? null}
            hideBalance={hideBalance}
            onSelect={(accountId) => {
              setPayFromId(accountId);
              setStatusMessage(null);
              setAccountPickerOpen(false);
            }}
            onClose={() => setAccountPickerOpen(false)}
            title="Pay from"
          />
        </View>
      ) : (
        <>
          {accountError ? (
            <View style={styles.accountErrorBox}>
              <View style={[styles.statusBanner, styles.statusBannerError]}>
                <Text
                  variant="caption"
                  color={colors.error}
                  accessibilityRole="alert"
                  style={styles.statusBannerText}
                >
                  {accountError}
                </Text>
              </View>
              <Button
                title="Try again"
                variant="secondary"
                onPress={() => void loadAccounts()}
              />
            </View>
          ) : null}
          <View style={styles.container}>
            {/* Tab switch */}
            <View style={styles.tabBar}>
              <Pressable
                style={[styles.tabItem, tab === 'incoming' && styles.tabItemActive]}
                onPress={() => setTab('incoming')}
                feedbackType="scale"
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === 'incoming' }}
                accessibilityLabel={`Incoming requests: ${incomingRequests.filter((r) => r.status === 'pending').length} pending`}
              >
                <ArrowDownLeft
                  size={18}
                  color={tab === 'incoming' ? colors.primary : colors.textSecondary}
                />
                <Text
                  variant="bodyStrong"
                  color={tab === 'incoming' ? colors.primary : colors.textSecondary}
                >
                  Incoming (
                  {incomingRequests.filter((r) => r.status === 'pending').length})
                </Text>
              </Pressable>

              <Pressable
                style={[styles.tabItem, tab === 'outgoing' && styles.tabItemActive]}
                onPress={() => setTab('outgoing')}
                feedbackType="scale"
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === 'outgoing' }}
                accessibilityLabel={`Outgoing requests: ${outgoingRequests.length}`}
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
              </Pressable>
            </View>

            {statusMessage && (
              <View
                style={[
                  styles.statusBanner,
                  statusKind === 'error'
                    ? styles.statusBannerError
                    : styles.statusBannerSuccess,
                ]}
              >
                <Text
                  variant="caption"
                  color={statusKind === 'error' ? colors.error : colors.primary}
                  accessibilityRole="alert"
                  style={styles.statusBannerText}
                >
                  {statusMessage}
                </Text>
              </View>
            )}

            <View style={styles.listArea}>
              {loading ? (
                <View
                  style={styles.itemsList}
                  accessibilityRole="progressbar"
                  accessibilityLabel="Loading payment requests"
                  testID="requests-skeleton"
                >
                  {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton
                      key={index}
                      width="100%"
                      height={112}
                      borderRadius={radius.md}
                    />
                  ))}
                </View>
              ) : requestsError ? (
                <EmptyState
                  title="Payment requests unavailable"
                  description={requestsError}
                  descriptionAccessibilityRole="alert"
                  illustration={MASCOT_ERROR}
                  illustrationTestID="requests-error-mascot"
                  actionTitle="Try again"
                  onAction={() => {
                    setLoading(true);
                    setRequestsError(null);
                    void loadRequests();
                  }}
                  scrollable={false}
                />
              ) : tab === 'incoming' ? (
                incomingRequests.length === 0 ? (
                  <EmptyState
                    scrollable={false}
                    illustration={MASCOT_EMPTY}
                    illustrationTestID="requests-incoming-empty-mascot"
                    title="No incoming requests"
                    description="When another Davao Bank customer requests money from you, it will appear here."
                    actionTitle="Request money"
                    onAction={() =>
                      navigation.navigate('QRHub', { initialTab: 'request' })
                    }
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
                            <View style={styles.badgeWrapper}>
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
                              onPress={() => {
                                // Clear an older banner (e.g. "Paid ₱X.") so it never turns red.
                                setStatusMessage(null);
                                setStatusKind('error');
                                handleDecline(req);
                              }}
                            />
                            <Button
                              title="Pay"
                              variant="primary"
                              accessibilityLabel={
                                hideBalance
                                  ? 'Pay request'
                                  : `Pay ${formatCentavosToPHP(req.amount)}`
                              }
                              disabled={
                                actionLoadingId === req.id ||
                                accountsLoading ||
                                Boolean(accountError) ||
                                accounts.length === 0
                              }
                              onPress={() => openPayReview(req)}
                            />
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )
              ) : outgoingRequests.length === 0 ? (
                <EmptyState
                  scrollable={false}
                  illustration={MASCOT_EMPTY}
                  illustrationTestID="requests-outgoing-empty-mascot"
                  title="No outgoing requests"
                  description="Payment requests you send to other Davao Bank users will be tracked here."
                  actionTitle="Request money"
                  onAction={() => navigation.navigate('QRHub', { initialTab: 'request' })}
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
                          <View style={styles.badgeWrapper}>
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
                            onPress={() => {
                              setStatusMessage(null);
                              setStatusKind('error');
                              handleCancel(req);
                            }}
                          />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </>
      )}
      <StepUpSetupLink error={statusMessage} onClose={onClose} />
      {confirmSheet}
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  reviewContainer: {
    gap: spacing.base,
  },
  container: {
    flex: 1,
    paddingBottom: spacing['2xl'],
  },
  scrollContent: {
    flexGrow: 1,
  },
  statusBannerText: {
    fontFamily: typography.fonts.bold,
  },
  accountErrorBox: {
    marginBottom: spacing.base,
  },
  errorContainer: {
    paddingVertical: spacing.xl,
    gap: spacing.base,
  },
  badgeWrapper: {
    marginTop: spacing.xs,
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
    flex: 1,
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
