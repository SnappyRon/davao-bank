import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AlertCircle, Calendar, Clock, MapPin, WifiOff } from 'lucide-react-native';
import {
  APPOINTMENTS_SIMULATION_COPY,
  appointmentErrorMessage,
  cancelBranchAppointment,
  colors,
  fetchMyAppointments,
  formatManilaAppointmentDate,
  formatManilaSlotWindow,
  formatReferenceId,
  isFutureAppointment,
  radius,
  size,
  spacing,
  type AppointmentStatus,
  type MyAppointment,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import {
  getIsOffline,
  reportNetworkResult,
  subscribeNetworkStatus,
} from '../lib/networkStatus';
import { MASCOT_EMPTY, MASCOT_ERROR } from '../assets/illustrations';
import { useConfirmSheet } from '../hooks/useConfirmSheet';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FeatureScreen,
  Pressable,
  Skeleton,
  Text,
  useToast,
  type BadgeVariant,
} from '../components';

export type AppointmentsRouteParamList = {
  BranchAppointments: undefined;
  BookAppointment: { branchId?: string } | undefined;
};

export interface BranchAppointmentsScreenProps {
  onBookAppointment?: () => void;
}

const SKELETON_COUNT = 3;
const SKELETON_CARD_HEIGHT = 96;
const TEXT_MAX_SCALE = 1.4;

function getStatusBadge(
  status: AppointmentStatus,
  future: boolean
): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'booked':
      return {
        label: 'Booked',
        variant: future ? 'scheduled' : 'neutral',
      };
    case 'completed':
      return { label: 'Completed', variant: 'success' };
    case 'cancelled':
    default:
      return { label: 'Cancelled', variant: 'cancelled' };
  }
}

export function BranchAppointmentsScreen({
  onBookAppointment,
}: BranchAppointmentsScreenProps = {}) {
  const { showConfirmation, confirmSheet } = useConfirmSheet();
  const toast = useToast();

  let navigation: NativeStackNavigationProp<AppointmentsRouteParamList> | null = null;
  try {
    navigation = useNavigation<NativeStackNavigationProp<AppointmentsRouteParamList>>();
  } catch {
    navigation = null;
  }

  let isFocused = true;
  try {
    isFocused = useIsFocused();
  } catch {
    isFocused = true;
  }

  const [appointments, setAppointments] = useState<MyAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [offline, setOffline] = useState<boolean>(() => getIsOffline());

  const mountedRef = useRef(true);
  const cancellingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = subscribeNetworkStatus(setOffline);
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const loadAppointments = useCallback(async (isPullRefresh = false) => {
    if (mountedRef.current) {
      if (isPullRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setLoadError(null);
    }

    try {
      const { data, error } = await fetchMyAppointments(supabase);
      reportNetworkResult(error);
      if (!mountedRef.current) return;

      if (error || !data) {
        setLoadError(appointmentErrorMessage(error, 'load'));
      } else {
        setAppointments(data);
        setLoadError(null);
      }
    } catch (err: unknown) {
      reportNetworkResult(err);
      if (mountedRef.current) {
        setLoadError(appointmentErrorMessage(err, 'load'));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (isFocused) {
      void loadAppointments();
    }
  }, [isFocused, loadAppointments]);

  const handleOpenBook = useCallback(() => {
    if (onBookAppointment) {
      onBookAppointment();
      return;
    }
    navigation?.navigate('BookAppointment');
  }, [navigation, onBookAppointment]);

  const handleRequestCancel = useCallback(
    (item: MyAppointment) => {
      if (cancellingRef.current) return;
      const dateText = formatManilaAppointmentDate(item.starts_at);
      const timeText = formatManilaSlotWindow(item.starts_at, item.ends_at);

      showConfirmation({
        title: 'Cancel appointment?',
        message: `Cancel your appointment at ${item.branch_name} on ${dateText}, ${timeText}?`,
        confirmLabel: 'Cancel appointment',
        cancelLabel: 'Keep appointment',
        destructive: true,
        onConfirm: async () => {
          if (cancellingRef.current) return;
          cancellingRef.current = true;
          setCancellingId(item.id);
          setActionError(null);

          try {
            const { error } = await cancelBranchAppointment(supabase, item.id);
            reportNetworkResult(error);
            if (!mountedRef.current) return;

            if (error) {
              const message = appointmentErrorMessage(error, 'action');
              setActionError(message);
              toast.show(message, 'error');
            } else {
              toast.show('Appointment cancelled');
              await loadAppointments();
            }
          } catch (err: unknown) {
            reportNetworkResult(err);
            if (mountedRef.current) {
              const message = appointmentErrorMessage(err, 'action');
              setActionError(message);
              toast.show(message, 'error');
            }
          } finally {
            cancellingRef.current = false;
            if (mountedRef.current) {
              setCancellingId(null);
            }
          }
        },
      });
    },
    [loadAppointments, showConfirmation, toast]
  );

  const { upcoming, history } = useMemo(() => {
    const nowMs = Date.now();
    const upcomingItems: MyAppointment[] = [];
    const historyItems: MyAppointment[] = [];

    for (const item of appointments) {
      if (isFutureAppointment(item, nowMs)) {
        upcomingItems.push(item);
      } else {
        historyItems.push(item);
      }
    }

    upcomingItems.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    historyItems.sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));

    return { upcoming: upcomingItems, history: historyItems };
  }, [appointments]);

  const showInitialSkeleton = loading && !refreshing && appointments.length === 0;
  const showEmptyError =
    !showInitialSkeleton && Boolean(loadError) && appointments.length === 0;
  const showEmptyList = !showInitialSkeleton && !loadError && appointments.length === 0;

  const renderAppointmentCard = (item: MyAppointment) => {
    const future = isFutureAppointment(item);
    const badge = getStatusBadge(item.status, future);
    const dateLabel = formatManilaAppointmentDate(item.starts_at);
    const slotWindow = formatManilaSlotWindow(item.starts_at, item.ends_at);
    const isCancellingThis = cancellingId === item.id;

    return (
      <Card key={item.id} style={styles.appointmentCard}>
        <View style={styles.cardTopRow}>
          <View style={styles.branchInfo}>
            <Text
              variant="bodyStrong"
              color={colors.ink}
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
            >
              {item.branch_name}
            </Text>
            <View style={styles.metaRow}>
              <MapPin size={14} color={colors.textSecondary} />
              <Text
                variant="caption"
                color={colors.textSecondary}
                style={styles.metaText}
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
              >
                {item.branch_area}
              </Text>
            </View>
          </View>
          <Badge label={badge.label} variant={badge.variant} />
        </View>

        <View style={styles.divider} />

        <View style={styles.detailsStack}>
          <View style={styles.metaRow}>
            <Calendar size={14} color={colors.textSecondary} />
            <Text
              variant="body"
              color={colors.ink}
              style={styles.metaText}
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
            >
              {dateLabel}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Clock size={14} color={colors.textSecondary} />
            <Text
              variant="caption"
              color={colors.textSecondary}
              style={styles.metaText}
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
            >
              {slotWindow} · Philippine time
            </Text>
          </View>
          <Text
            variant="caption"
            color={colors.textMuted}
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
          >
            Queue reference · {formatReferenceId(item.id)}
          </Text>
          {item.staff_note ? (
            <Text
              variant="caption"
              color={colors.textSecondary}
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
            >
              Staff note · {item.staff_note}
            </Text>
          ) : null}
        </View>

        {future ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Cancel appointment at ${item.branch_name} on ${dateLabel}`}
            disabled={cancellingId !== null}
            onPress={() => handleRequestCancel(item)}
            feedbackType="scale"
            style={[
              styles.cancelAction,
              cancellingId !== null && styles.cancelActionDisabled,
            ]}
          >
            <Text
              variant="label"
              color={colors.redText}
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
            >
              {isCancellingThis ? 'Cancelling…' : 'Cancel appointment'}
            </Text>
          </Pressable>
        ) : null}
      </Card>
    );
  };

  return (
    <FeatureScreen
      title="Branch appointments"
      isProcessing={cancellingId !== null}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadAppointments(true)}
          tintColor={colors.primary}
        />
      }
      footer={
        appointments.length > 0 ? (
          <Button
            title="Book appointment"
            variant="primary"
            disabled={cancellingId !== null}
            onPress={handleOpenBook}
          />
        ) : undefined
      }
    >
      <View style={styles.simulationBox}>
        <Badge
          label="Simulation"
          variant="warning"
          testID="appointments-simulation-badge"
        />
        <Text
          variant="caption"
          color={colors.textSecondary}
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
        >
          {APPOINTMENTS_SIMULATION_COPY}
        </Text>
      </View>

      {(offline || loadError) && appointments.length > 0 ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.inlineBanner}
        >
          <View style={styles.inlineBannerTextRow}>
            <WifiOff size={16} color={colors.orangeText} />
            <Text
              variant="caption"
              color={colors.ink}
              style={styles.metaText}
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
            >
              {loadError || "You're offline — showing your last update"}
            </Text>
          </View>
          <Button
            title="Try again"
            variant="secondary"
            onPress={() => void loadAppointments()}
          />
        </View>
      ) : null}

      {actionError ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.errorAlertBox}
        >
          <AlertCircle size={16} color={colors.redText} />
          <Text
            variant="caption"
            color={colors.redText}
            style={styles.metaText}
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
          >
            {actionError}
          </Text>
        </View>
      ) : null}

      {showInitialSkeleton ? (
        <View style={styles.skeletonStack}>
          {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
            <Skeleton
              key={index}
              width="100%"
              height={SKELETON_CARD_HEIGHT}
              borderRadius={radius.md}
              testID={`appointments-skeleton-${index}`}
            />
          ))}
        </View>
      ) : showEmptyError ? (
        <EmptyState
          title="Appointments unavailable"
          description={loadError || undefined}
          descriptionAccessibilityRole="alert"
          illustration={MASCOT_ERROR}
          illustrationTestID="appointments-error-mascot"
          actionTitle="Try again"
          onAction={() => void loadAppointments()}
          scrollable={false}
        />
      ) : showEmptyList ? (
        <EmptyState
          title="No appointments yet"
          description="Book a demo visit at a Davao Bank branch to reserve a 30-minute time slot."
          illustration={MASCOT_EMPTY}
          illustrationTestID="appointments-empty-mascot"
          actionTitle="Book appointment"
          onAction={handleOpenBook}
          scrollable={false}
        />
      ) : (
        <View style={styles.sectionsContainer}>
          {upcoming.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text
                variant="label"
                color={colors.textSecondary}
                accessibilityRole="header"
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
              >
                Upcoming
              </Text>
              <View style={styles.cardsStack}>{upcoming.map(renderAppointmentCard)}</View>
            </View>
          ) : null}

          {history.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text
                variant="label"
                color={colors.textSecondary}
                accessibilityRole="header"
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
              >
                Past and cancelled
              </Text>
              <View style={styles.cardsStack}>{history.map(renderAppointmentCard)}</View>
            </View>
          ) : null}
        </View>
      )}

      {confirmSheet}
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  simulationBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inlineBanner: {
    backgroundColor: colors.tintOrange,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  inlineBannerTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tintRed,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  skeletonStack: {
    gap: spacing.md,
  },
  sectionsContainer: {
    gap: spacing.xl,
  },
  sectionBlock: {
    gap: spacing.sm,
  },
  cardsStack: {
    gap: spacing.md,
  },
  appointmentCard: {
    padding: spacing.base,
    gap: spacing.md,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  branchInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  detailsStack: {
    gap: spacing.xs,
  },
  cancelAction: {
    minHeight: size.touch,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
  },
  cancelActionDisabled: {
    opacity: 0.5,
  },
});
