import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FileText, Award, CreditCard, UserCheck, Globe } from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  fetchAccountBalances,
  fetchMyServiceRequests,
  cancelServiceRequest,
  formatReferenceId,
  serviceRequestTypeLabel,
  serviceRequestStatusLabel,
  getRemitTimelineSteps,
  toServiceRequestErrorMessage,
  type AccountBalance,
  type ServiceRequest,
  type ServiceRequestStatus,
  type ServiceRequestType,
} from '@davao-bank/shared';
import type { RootStackParamList } from '../../App';
import { supabase } from '../lib/supabase';
import { reportNetworkResult } from '../lib/networkStatus';
import { MASCOT_EMPTY, MASCOT_ERROR } from '../assets/illustrations';
import { useConfirmSheet } from '../hooks/useConfirmSheet';
import { useInFlightGuard } from '../hooks/useInFlightGuard';
import { formatPlainDate } from '../utils/moneyFlow';
import {
  FeatureScreen,
  Text,
  Button,
  Card,
  Badge,
  EmptyState,
  Skeleton,
  useToast,
  formatAccountLabel,
  LIST_DISC_SIZE,
  LIST_ICON_SIZE,
  type BadgeVariant,
} from '../components';

export type ServiceRequestsStackParamList = RootStackParamList & {
  ServiceRequests: undefined;
  NewServiceRequest: { initialType?: ServiceRequestType } | undefined;
};

const SKELETON_COUNT = 3;
const SKELETON_HEIGHT = 104;

export function serviceRequestStatusBadge(status: ServiceRequestStatus): {
  label: string;
  variant: BadgeVariant;
} {
  const label = serviceRequestStatusLabel(status);
  switch (status) {
    case 'submitted':
      return { label, variant: 'pending' };
    case 'in_review':
      return { label, variant: 'info' };
    case 'completed':
      return { label, variant: 'completed' };
    case 'rejected':
      return { label, variant: 'danger' };
    case 'cancelled':
    default:
      return { label, variant: 'cancelled' };
  }
}

function renderRequestTypeIcon(type: ServiceRequestType) {
  switch (type) {
    case 'statement':
      return <FileText size={LIST_ICON_SIZE} color={colors.primary} />;
    case 'certificate':
      return <Award size={LIST_ICON_SIZE} color={colors.primary} />;
    case 'card_replacement':
      return <CreditCard size={LIST_ICON_SIZE} color={colors.primary} />;
    case 'account_update':
      return <UserCheck size={LIST_ICON_SIZE} color={colors.primary} />;
    case 'remit_status':
      return <Globe size={LIST_ICON_SIZE} color={colors.primary} />;
  }
}

function formatCreatedDate(isoTimestamp: string): string {
  const datePart = isoTimestamp ? isoTimestamp.slice(0, 10) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return formatPlainDate(datePart);
  }
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function summarizeDetails(
  item: ServiceRequest,
  accountsById: Map<string, AccountBalance>
): string {
  const d = item.details || {};
  switch (item.type) {
    case 'statement': {
      const rawAccId = typeof d.account_id === 'string' ? d.account_id : '';
      const acc = rawAccId ? accountsById.get(rawAccId) : undefined;
      const accLabel = acc
        ? formatAccountLabel(acc)
        : rawAccId
          ? `Account ${formatReferenceId(rawAccId)}`
          : 'Account';
      const start =
        typeof d.start_date === 'string' ? formatPlainDate(d.start_date) : '—';
      const end = typeof d.end_date === 'string' ? formatPlainDate(d.end_date) : '—';
      return `${accLabel} · ${start} to ${end}`;
    }
    case 'certificate': {
      const purpose = typeof d.purpose === 'string' ? d.purpose : 'General purpose';
      return `Purpose: ${purpose}`;
    }
    case 'card_replacement': {
      const reason = typeof d.reason === 'string' ? d.reason : 'Card replacement';
      const last4 = typeof d.last4 === 'string' && d.last4 ? ` · •• ${d.last4}` : '';
      return `Reason: ${reason}${last4}`;
    }
    case 'account_update': {
      const fieldLabel = d.field === 'email' ? 'Email address' : 'Mobile number';
      const newVal = typeof d.new_value === 'string' ? d.new_value : '—';
      return `${fieldLabel}: ${newVal}`;
    }
    case 'remit_status': {
      const rawRef = typeof d.reference === 'string' ? d.reference : '';
      const cleanRef = formatReferenceId(rawRef.replace(/^DB-/i, ''));
      return `Tracking reference: ${cleanRef || '—'}`;
    }
  }
}

export function ServiceRequestsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<ServiceRequestsStackParamList>>();
  const toast = useToast();
  const { showConfirmation, confirmSheet } = useConfirmSheet();
  const guardCancel = useInFlightGuard();

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadData = useCallback(async () => {
    if (mountedRef.current) {
      setLoadError(null);
    }

    try {
      const [reqRes, accRes] = await Promise.all([
        fetchMyServiceRequests(supabase),
        fetchAccountBalances(supabase),
      ]);

      reportNetworkResult(reqRes.error);
      if (!mountedRef.current) return;

      if (accRes.data) {
        setAccounts(accRes.data);
      }

      if (reqRes.error || !reqRes.data) {
        setLoadError(toServiceRequestErrorMessage(reqRes.error, 'load'));
        setRequests([]);
      } else {
        setRequests(reqRes.data);
        setLoadError(null);
      }
    } catch (err: unknown) {
      reportNetworkResult(err);
      if (mountedRef.current) {
        setLoadError(toServiceRequestErrorMessage(err, 'load'));
        setRequests([]);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Keep this callback stable: a changing dependency refetches after every
      // state update and can race the action the customer just took.
      void loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    setActionError(null);
    void loadData();
  };

  const executeCancel = async (item: ServiceRequest) => {
    setCancellingId(item.id);
    setActionError(null);
    try {
      const { error } = await cancelServiceRequest(supabase, item.id);
      reportNetworkResult(error);
      if (!mountedRef.current) return;

      if (error) {
        const msg = toServiceRequestErrorMessage(error, 'action');
        setActionError(msg);
        toast.show(msg, 'error');
      } else {
        toast.show('Service request cancelled.');
        await loadData();
      }
    } catch (err: unknown) {
      reportNetworkResult(err);
      if (mountedRef.current) {
        const msg = toServiceRequestErrorMessage(err, 'action');
        setActionError(msg);
        toast.show(msg, 'error');
      }
    } finally {
      if (mountedRef.current) {
        setCancellingId(null);
      }
    }
  };

  const promptCancelRequest = (item: ServiceRequest, refCode: string) => {
    if (cancellingId !== null) return;
    showConfirmation({
      title: 'Cancel service request?',
      message: `Cancel ${serviceRequestTypeLabel(item.type).toLowerCase()} (${refCode})? You can submit a new request anytime.`,
      confirmLabel: 'Cancel request',
      cancelLabel: 'Keep request',
      destructive: true,
      onConfirm: () => {
        void guardCancel(() => executeCancel(item));
      },
    });
  };

  const accountsById = new Map(accounts.map((acc) => [acc.account_id, acc]));

  const footer =
    !loading && !loadError ? (
      <Button
        title="New request"
        variant="primary"
        disabled={cancellingId !== null}
        onPress={() => navigation.navigate('NewServiceRequest')}
      />
    ) : undefined;

  return (
    <FeatureScreen
      title="Service requests"
      isProcessing={cancellingId !== null}
      footer={footer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.container}>
        {actionError ? (
          <View style={styles.actionErrorBox}>
            <Text
              variant="caption"
              color={colors.redText}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              {actionError}
            </Text>
          </View>
        ) : null}

        {loading && !refreshing ? (
          <View style={styles.skeletonList} accessibilityLabel="Loading service requests">
            {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
              <Skeleton
                key={`sr-skeleton-${index}`}
                width="100%"
                height={SKELETON_HEIGHT}
                borderRadius={radius.md}
              />
            ))}
          </View>
        ) : loadError ? (
          <EmptyState
            title="Service requests unavailable"
            description={loadError}
            descriptionAccessibilityRole="alert"
            illustration={MASCOT_ERROR}
            illustrationTestID="service-requests-error-mascot"
            actionTitle="Try again"
            onAction={() => void loadData()}
            scrollable={false}
          />
        ) : requests.length === 0 ? (
          <EmptyState
            title="No service requests yet"
            description="Request a statement copy, bank certificate, card replacement, account update or remittance check."
            illustration={MASCOT_EMPTY}
            illustrationTestID="service-requests-empty-mascot"
            scrollable={false}
          />
        ) : (
          <View style={styles.list}>
            {requests.map((item) => {
              const typeTitle = serviceRequestTypeLabel(item.type);
              const badge = serviceRequestStatusBadge(item.status);
              const refCode = formatReferenceId(
                (item.reference || '').replace(/^DB-/i, '') || item.id
              );
              const summary = summarizeDetails(item, accountsById);
              const createdStr = formatCreatedDate(item.created_at);
              const isCancellingThis = cancellingId === item.id;

              return (
                <Card key={item.id} style={styles.requestCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.iconDisc}>
                      {renderRequestTypeIcon(item.type)}
                    </View>
                    <View style={styles.headerTextCol}>
                      <View style={styles.titleRow}>
                        <Text
                          variant="bodyStrong"
                          color={colors.ink}
                          style={styles.typeTitle}
                          maxFontSizeMultiplier={1.4}
                        >
                          {typeTitle}
                        </Text>
                        <Badge label={badge.label} variant={badge.variant} />
                      </View>
                      <Text
                        variant="caption"
                        color={colors.textSecondary}
                        tabularNums
                        maxFontSizeMultiplier={1.4}
                      >
                        {refCode} · {createdStr}
                      </Text>
                    </View>
                  </View>

                  <Text variant="body" color={colors.ink} style={styles.summaryText}>
                    {summary}
                  </Text>

                  {item.type === 'remit_status' ? (
                    <View style={styles.timelineBox}>
                      <View style={styles.timelineSteps}>
                        {getRemitTimelineSteps(item.status).map((stepItem) => (
                          <View key={stepItem.label} style={styles.timelineStepRow}>
                            <View
                              style={[
                                styles.timelineDot,
                                stepItem.state === 'done' && styles.timelineDotDone,
                                stepItem.state === 'current' && styles.timelineDotCurrent,
                                stepItem.state === 'stopped' && styles.timelineDotStopped,
                              ]}
                            />
                            <Text
                              variant={stepItem.state === 'current' ? 'label' : 'caption'}
                              color={
                                stepItem.state === 'upcoming'
                                  ? colors.textMuted
                                  : stepItem.state === 'stopped'
                                    ? colors.redText
                                    : colors.ink
                              }
                              maxFontSizeMultiplier={1.4}
                            >
                              {stepItem.label}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {item.staff_note ? (
                    <View style={styles.staffNoteBox}>
                      <Text variant="caption" color={colors.textSecondary}>
                        Note: {item.staff_note}
                      </Text>
                    </View>
                  ) : null}

                  {item.status === 'submitted' ? (
                    <Button
                      title={isCancellingThis ? 'Cancelling…' : 'Cancel request'}
                      variant="secondaryDestructive"
                      loading={isCancellingThis}
                      disabled={cancellingId !== null}
                      accessibilityLabel={`Cancel ${typeTitle} ${refCode}`}
                      onPress={() => promptCancelRequest(item, refCode)}
                      style={styles.cancelBtn}
                    />
                  ) : null}
                </Card>
              );
            })}
          </View>
        )}
      </View>
      {confirmSheet}
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.base,
  },
  actionErrorBox: {
    backgroundColor: colors.tintRed,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  skeletonList: {
    gap: spacing.md,
  },
  list: {
    gap: spacing.md,
  },
  requestCard: {
    padding: spacing.base,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  iconDisc: {
    width: LIST_DISC_SIZE,
    height: LIST_DISC_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    flex: 1,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  typeTitle: {
    flexShrink: 1,
    minWidth: 120,
  },
  summaryText: {
    color: colors.textSecondary,
  },
  timelineBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.sm,
  },
  timelineSteps: {
    gap: spacing.xs,
  },
  timelineStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  timelineDotDone: {
    backgroundColor: colors.primary,
  },
  timelineDotCurrent: {
    backgroundColor: colors.blue,
  },
  timelineDotStopped: {
    backgroundColor: colors.red,
  },
  staffNoteBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  cancelBtn: {
    marginTop: spacing.xs,
  },
});
