import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AlertCircle,
  Briefcase,
  Building2,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  WifiOff,
} from 'lucide-react-native';
import {
  APPOINTMENT_PURPOSES,
  appointmentErrorMessage,
  bookBranchAppointment,
  colors,
  fetchBranches,
  fetchOpenAppointmentSlots,
  formatManilaAppointmentDate,
  formatManilaDateISO,
  formatManilaSlotWindow,
  formatReferenceId,
  generateIdempotencyKey,
  getUpcomingManilaDates,
  isSlotTakenError,
  radius,
  size,
  spacing,
  validateAppointmentDate,
  type AppointmentPurpose,
  type BookAppointmentResult,
  type Branch,
  type OpenAppointmentSlot,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import {
  getIsOffline,
  reportNetworkResult,
  subscribeNetworkStatus,
} from '../lib/networkStatus';
import { MASCOT_EMPTY, MASCOT_ERROR } from '../assets/illustrations';
import type { AppointmentsRouteParamList } from './BranchAppointmentsScreen';
import {
  Button,
  Chip,
  EmptyState,
  FeatureScreen,
  GroupedList,
  groupedListStyles,
  LIST_ICON_SIZE,
  ListHairline,
  Pressable,
  ResultView,
  Skeleton,
  Text,
  TextField,
} from '../components';

export type BookingStep = 'branch' | 'date' | 'slot' | 'purpose' | 'review' | 'result';

const INPUT_STEPS: BookingStep[] = ['branch', 'date', 'slot', 'purpose', 'review'];
const SKELETON_ROWS = 3;
const SKELETON_ROW_HEIGHT = 72;
const TEXT_MAX_SCALE = 1.4;

export interface BookAppointmentScreenProps {
  onDone?: () => void;
  onViewAppointments?: () => void;
}

export function BookAppointmentScreen({
  onDone,
  onViewAppointments,
}: BookAppointmentScreenProps = {}) {
  let navigation: NativeStackNavigationProp<AppointmentsRouteParamList> | null = null;
  try {
    navigation = useNavigation<NativeStackNavigationProp<AppointmentsRouteParamList>>();
  } catch {
    navigation = null;
  }

  let prefillBranchId: string | undefined;
  try {
    const route = useRoute<RouteProp<AppointmentsRouteParamList, 'BookAppointment'>>();
    prefillBranchId = route.params?.branchId;
  } catch {
    prefillBranchId = undefined;
  }

  const upcomingDates = useMemo(() => getUpcomingManilaDates(3), []);

  const [step, setStep] = useState<BookingStep>('branch');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);

  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => formatManilaDateISO());
  const [dateError, setDateError] = useState<string | null>(null);

  const [slots, setSlots] = useState<OpenAppointmentSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<OpenAppointmentSlot | null>(null);

  const [selectedPurpose, setSelectedPurpose] = useState<AppointmentPurpose | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    generateIdempotencyKey('appt')
  );

  const [booking, setBooking] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<BookAppointmentResult | null>(null);
  const [offline, setOffline] = useState<boolean>(() => getIsOffline());

  const mountedRef = useRef(true);
  const prefillAppliedRef = useRef(false);
  const slotRequestIdRef = useRef(0);
  const bookingInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = subscribeNetworkStatus(setOffline);
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const loadBranches = useCallback(async () => {
    if (mountedRef.current) {
      setBranchesLoading(true);
      setBranchesError(null);
    }

    try {
      const { data, error } = await fetchBranches(supabase);
      reportNetworkResult(error);
      if (!mountedRef.current) return;

      if (error || !data) {
        setBranches([]);
        setBranchesError(appointmentErrorMessage(error, 'load'));
      } else {
        setBranches(data);
        setBranchesError(null);
        if (prefillBranchId && !prefillAppliedRef.current) {
          const matched = data.find((b) => b.id === prefillBranchId);
          if (matched) {
            prefillAppliedRef.current = true;
            setSelectedBranch(matched);
            setStep('date');
          }
        }
      }
    } catch (err: unknown) {
      reportNetworkResult(err);
      if (mountedRef.current) {
        setBranches([]);
        setBranchesError(appointmentErrorMessage(err, 'load'));
      }
    } finally {
      if (mountedRef.current) {
        setBranchesLoading(false);
      }
    }
  }, [prefillBranchId]);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  const loadOpenSlots = useCallback(async (branchId: string, dateIso: string) => {
    const reqId = ++slotRequestIdRef.current;
    if (mountedRef.current) {
      setSlotsLoading(true);
      setSlotsError(null);
    }

    try {
      const { data, error } = await fetchOpenAppointmentSlots(
        supabase,
        branchId,
        dateIso
      );
      reportNetworkResult(error);
      if (!mountedRef.current || slotRequestIdRef.current !== reqId) return;

      if (error || !data) {
        setSlots([]);
        setSlotsError(appointmentErrorMessage(error, 'load'));
      } else {
        setSlots(data);
        setSlotsError(null);
      }
    } catch (err: unknown) {
      reportNetworkResult(err);
      if (mountedRef.current && slotRequestIdRef.current === reqId) {
        setSlots([]);
        setSlotsError(appointmentErrorMessage(err, 'load'));
      }
    } finally {
      if (mountedRef.current && slotRequestIdRef.current === reqId) {
        setSlotsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (step === 'slot' && selectedBranch) {
      void loadOpenSlots(selectedBranch.id, selectedDate);
    }
  }, [step, selectedBranch, selectedDate, loadOpenSlots]);

  const handleSelectBranch = (branch: Branch) => {
    if (selectedBranch?.id !== branch.id) {
      setSelectedSlot(null);
      setSlotNotice(null);
    }
    setSelectedBranch(branch);
    setReviewError(null);
    setStep('date');
  };

  const handleDateChange = (value: string) => {
    setSelectedDate(value);
    setDateError(null);
    setSelectedSlot(null);
    setSlotNotice(null);
  };

  const handleContinueFromDate = () => {
    const check = validateAppointmentDate(selectedDate);
    if (!check.valid) {
      setDateError(check.error);
      return;
    }
    setDateError(null);
    setSlotNotice(null);
    setStep('slot');
  };

  const handleSelectSlot = (slot: OpenAppointmentSlot) => {
    setSelectedSlot(slot);
    setSlotNotice(null);
    setReviewError(null);
    setIdempotencyKey(generateIdempotencyKey('appt'));
    setStep('purpose');
  };

  const handleSelectPurpose = (purpose: AppointmentPurpose) => {
    setSelectedPurpose(purpose);
    setReviewError(null);
    setStep('review');
  };

  const handlePrevStep = () => {
    setReviewError(null);
    switch (step) {
      case 'review':
        setStep('purpose');
        break;
      case 'purpose':
        setStep('slot');
        break;
      case 'slot':
        setSlotNotice(null);
        setStep('date');
        break;
      case 'date':
        setStep('branch');
        break;
      default:
        break;
    }
  };

  const handleBookAppointment = async () => {
    if (
      bookingInFlightRef.current ||
      !selectedBranch ||
      !selectedSlot ||
      !selectedPurpose
    ) {
      return;
    }

    bookingInFlightRef.current = true;
    setBooking(true);
    setReviewError(null);

    try {
      const { data, error } = await bookBranchAppointment(supabase, {
        branchId: selectedBranch.id,
        slotId: selectedSlot.id,
        idempotencyKey,
      });
      reportNetworkResult(error);
      if (!mountedRef.current) return;

      if (error || !data) {
        if (isSlotTakenError(error)) {
          const message = appointmentErrorMessage(error, 'action');
          setSelectedSlot(null);
          setIdempotencyKey(generateIdempotencyKey('appt'));
          setSlotNotice(message);
          setStep('slot');
          return;
        }
        setReviewError(appointmentErrorMessage(error, 'action'));
        return;
      }

      setBookingResult(data);
      setStep('result');
    } catch (err: unknown) {
      reportNetworkResult(err);
      if (!mountedRef.current) return;
      if (isSlotTakenError(err)) {
        const message = appointmentErrorMessage(err, 'action');
        setSelectedSlot(null);
        setIdempotencyKey(generateIdempotencyKey('appt'));
        setSlotNotice(message);
        setStep('slot');
        return;
      }
      setReviewError(appointmentErrorMessage(err, 'action'));
    } finally {
      bookingInFlightRef.current = false;
      if (mountedRef.current) {
        setBooking(false);
      }
    }
  };

  const handleDone = () => {
    if (onDone) {
      onDone();
      return;
    }
    navigation?.goBack();
  };

  const handleViewAppointments = () => {
    if (onViewAppointments) {
      onViewAppointments();
      return;
    }
    if (typeof navigation?.replace === 'function') {
      navigation.replace('BranchAppointments');
      return;
    }
    navigation?.navigate('BranchAppointments');
  };

  const stepIndex = INPUT_STEPS.indexOf(step);
  const currentStepNumber = step === 'result' ? undefined : stepIndex + 1;
  const stepCount = step === 'result' ? undefined : INPUT_STEPS.length;
  const isDirty = step !== 'result' && (selectedBranch !== null || stepIndex > 0);

  const selectedPurposeOption = useMemo(
    () => APPOINTMENT_PURPOSES.find((p) => p.code === selectedPurpose) ?? null,
    [selectedPurpose]
  );

  const renderFooter = () => {
    if (step === 'date') {
      return (
        <Button title="Continue" variant="primary" onPress={handleContinueFromDate} />
      );
    }
    if (step === 'purpose' && selectedPurpose) {
      return (
        <Button title="Continue" variant="primary" onPress={() => setStep('review')} />
      );
    }
    if (step === 'review') {
      return (
        <Button
          title={booking ? 'Booking…' : 'Book appointment'}
          variant="primary"
          loading={booking}
          disabled={booking || !selectedBranch || !selectedSlot || !selectedPurpose}
          onPress={() => void handleBookAppointment()}
        />
      );
    }
    return undefined;
  };

  if (step === 'result' && bookingResult && selectedBranch && selectedSlot) {
    return (
      <FeatureScreen title="Book appointment">
        <ResultView
          outcome="scheduled"
          title="Appointment booked"
          details={[
            {
              label: 'Queue reference',
              value: formatReferenceId(bookingResult.id),
            },
            { label: 'Branch', value: selectedBranch.name },
            { label: 'Area', value: selectedBranch.area },
            {
              label: 'Date',
              value: formatManilaAppointmentDate(selectedDate),
            },
            {
              label: 'Time',
              value: formatManilaSlotWindow(selectedSlot.starts_at, selectedSlot.ends_at),
            },
            {
              label: 'Purpose',
              value: selectedPurposeOption?.label ?? 'General banking',
            },
          ]}
          onDone={handleDone}
          contextualActionTitle="View my appointments"
          onContextualAction={handleViewAppointments}
        />
      </FeatureScreen>
    );
  }

  return (
    <FeatureScreen
      title="Book appointment"
      step={currentStepNumber}
      stepCount={stepCount}
      onPrevStep={handlePrevStep}
      isDirty={isDirty}
      isProcessing={booking}
      footer={renderFooter()}
    >
      {offline ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.offlineNotice}
        >
          <WifiOff size={16} color={colors.orangeText} />
          <Text
            variant="caption"
            color={colors.ink}
            style={styles.flexText}
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
          >
            You appear to be offline. Check your connection before booking.
          </Text>
        </View>
      ) : null}

      {step === 'branch' ? (
        <View style={styles.stepSection}>
          <Text
            variant="title"
            color={colors.ink}
            accessibilityRole="header"
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
          >
            Choose a branch
          </Text>
          <Text
            variant="body"
            color={colors.textSecondary}
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
          >
            Choose a Davao Bank branch in Davao City
          </Text>

          {branchesLoading ? (
            <View style={styles.skeletonStack}>
              {Array.from({ length: SKELETON_ROWS }).map((_, idx) => (
                <Skeleton
                  key={idx}
                  width="100%"
                  height={SKELETON_ROW_HEIGHT}
                  borderRadius={radius.md}
                  testID={`book-branches-skeleton-${idx}`}
                />
              ))}
            </View>
          ) : branchesError ? (
            <EmptyState
              title="Branches unavailable"
              description={branchesError}
              descriptionAccessibilityRole="alert"
              illustration={MASCOT_ERROR}
              illustrationTestID="book-branches-error-mascot"
              actionTitle="Try again"
              onAction={() => void loadBranches()}
              scrollable={false}
            />
          ) : branches.length === 0 ? (
            <EmptyState
              title="No branches available"
              description="No branches are active right now."
              illustration={MASCOT_EMPTY}
              illustrationTestID="book-branches-empty-mascot"
              actionTitle="Try again"
              onAction={() => void loadBranches()}
              scrollable={false}
            />
          ) : (
            <GroupedList>
              {branches.map((branch, index) => {
                const selected = selectedBranch?.id === branch.id;
                return (
                  <React.Fragment key={branch.id}>
                    {index > 0 ? <ListHairline /> : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${branch.name}, ${branch.area}`}
                      accessibilityState={{ selected }}
                      feedbackType="highlight"
                      onPress={() => handleSelectBranch(branch)}
                      style={groupedListStyles.row}
                    >
                      <View
                        style={[
                          groupedListStyles.disc,
                          {
                            backgroundColor: selected
                              ? colors.primaryTint
                              : colors.surfaceSubtle,
                          },
                        ]}
                      >
                        <Building2
                          size={LIST_ICON_SIZE}
                          color={selected ? colors.primary : colors.textSecondary}
                        />
                      </View>
                      <View style={styles.rowBody}>
                        <Text
                          variant="bodyStrong"
                          color={colors.ink}
                          maxFontSizeMultiplier={TEXT_MAX_SCALE}
                        >
                          {branch.name}
                        </Text>
                        <Text
                          variant="caption"
                          color={colors.textSecondary}
                          maxFontSizeMultiplier={TEXT_MAX_SCALE}
                        >
                          {branch.area}
                        </Text>
                        {branch.address ? (
                          <Text
                            variant="caption"
                            color={colors.textMuted}
                            maxFontSizeMultiplier={TEXT_MAX_SCALE}
                          >
                            {branch.address}
                          </Text>
                        ) : null}
                      </View>
                      <ChevronRight size={18} color={colors.textMuted} />
                    </Pressable>
                  </React.Fragment>
                );
              })}
            </GroupedList>
          )}
        </View>
      ) : null}

      {step === 'date' && selectedBranch ? (
        <View style={styles.stepSection}>
          <View style={styles.contextBar}>
            <View style={styles.rowBody}>
              <Text
                variant="caption"
                color={colors.textSecondary}
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
              >
                Selected branch
              </Text>
              <Text
                variant="bodyStrong"
                color={colors.ink}
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
              >
                {selectedBranch.name}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change branch"
              feedbackType="scale"
              onPress={() => setStep('branch')}
              style={styles.changeButton}
            >
              <Text
                variant="label"
                color={colors.primary}
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
              >
                Change
              </Text>
            </Pressable>
          </View>

          <Text
            variant="title"
            color={colors.ink}
            accessibilityRole="header"
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
          >
            Pick a banking date
          </Text>

          <View style={styles.chipRow}>
            {upcomingDates.map((d) => (
              <Chip
                key={d.isoDate}
                label={d.label}
                selected={selectedDate.trim() === d.isoDate}
                onPress={() => handleDateChange(d.isoDate)}
              />
            ))}
          </View>

          <TextField
            label="Banking date"
            value={selectedDate}
            onChangeText={handleDateChange}
            placeholder="YYYY-MM-DD"
            helperText="Philippine time (YYYY-MM-DD)"
            error={dateError ?? undefined}
            maxLength={10}
          />
        </View>
      ) : null}

      {step === 'slot' && selectedBranch ? (
        <View style={styles.stepSection}>
          <View style={styles.contextBar}>
            <View style={styles.rowBody}>
              <Text
                variant="bodyStrong"
                color={colors.ink}
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
              >
                {selectedBranch.name}
              </Text>
              <Text
                variant="caption"
                color={colors.textSecondary}
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
              >
                {formatManilaAppointmentDate(selectedDate)} · Philippine time
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change banking date"
              feedbackType="scale"
              onPress={() => {
                setSlotNotice(null);
                setStep('date');
              }}
              style={styles.changeButton}
            >
              <Text
                variant="label"
                color={colors.primary}
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
              >
                Change date
              </Text>
            </Pressable>
          </View>

          {slotNotice ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={styles.slotTakenAlert}
            >
              <AlertCircle size={18} color={colors.orangeText} />
              <Text
                variant="body"
                color={colors.ink}
                style={styles.flexText}
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
              >
                {slotNotice}
              </Text>
            </View>
          ) : null}

          <Text
            variant="title"
            color={colors.ink}
            accessibilityRole="header"
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
          >
            Choose an open slot
          </Text>

          {slotsLoading ? (
            <View style={styles.skeletonStack}>
              {Array.from({ length: SKELETON_ROWS }).map((_, idx) => (
                <Skeleton
                  key={idx}
                  width="100%"
                  height={SKELETON_ROW_HEIGHT}
                  borderRadius={radius.md}
                  testID={`book-slots-skeleton-${idx}`}
                />
              ))}
            </View>
          ) : slotsError ? (
            <EmptyState
              title="Open slots unavailable"
              description={slotsError}
              descriptionAccessibilityRole="alert"
              illustration={MASCOT_ERROR}
              illustrationTestID="book-slots-error-mascot"
              actionTitle="Try again"
              onAction={() => void loadOpenSlots(selectedBranch.id, selectedDate)}
              scrollable={false}
            />
          ) : slots.length === 0 ? (
            <EmptyState
              title="No open slots"
              description="All slots for this date are booked or have passed. Choose another banking date."
              illustration={MASCOT_EMPTY}
              illustrationTestID="book-slots-empty-mascot"
              actionTitle="Choose another date"
              onAction={() => {
                setSlotNotice(null);
                setStep('date');
              }}
              scrollable={false}
            />
          ) : (
            <GroupedList>
              {slots.map((slot, index) => {
                const selected = selectedSlot?.id === slot.id;
                const windowLabel = formatManilaSlotWindow(slot.starts_at, slot.ends_at);
                const spotsLabel =
                  slot.available === 1 ? '1 spot open' : `${slot.available} spots open`;

                return (
                  <React.Fragment key={slot.id}>
                    {index > 0 ? <ListHairline /> : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${windowLabel}, ${spotsLabel}`}
                      accessibilityState={{ selected }}
                      feedbackType="highlight"
                      onPress={() => handleSelectSlot(slot)}
                      style={groupedListStyles.row}
                    >
                      <View
                        style={[
                          groupedListStyles.disc,
                          {
                            backgroundColor: selected
                              ? colors.primaryTint
                              : colors.surfaceSubtle,
                          },
                        ]}
                      >
                        <Clock
                          size={LIST_ICON_SIZE}
                          color={selected ? colors.primary : colors.textSecondary}
                        />
                      </View>
                      <View style={styles.rowBody}>
                        <Text
                          variant="bodyStrong"
                          color={colors.ink}
                          maxFontSizeMultiplier={TEXT_MAX_SCALE}
                        >
                          {windowLabel}
                        </Text>
                        <Text
                          variant="caption"
                          color={colors.textSecondary}
                          maxFontSizeMultiplier={TEXT_MAX_SCALE}
                        >
                          {spotsLabel}
                        </Text>
                      </View>
                      <ChevronRight size={18} color={colors.textMuted} />
                    </Pressable>
                  </React.Fragment>
                );
              })}
            </GroupedList>
          )}
        </View>
      ) : null}

      {step === 'purpose' ? (
        <View style={styles.stepSection}>
          <Text
            variant="title"
            color={colors.ink}
            accessibilityRole="header"
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
          >
            Choose visit purpose
          </Text>
          <Text
            variant="body"
            color={colors.textSecondary}
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
          >
            Let the branch team know what you need help with.
          </Text>

          <GroupedList>
            {APPOINTMENT_PURPOSES.map((purpose, index) => {
              const selected = selectedPurpose === purpose.code;
              return (
                <React.Fragment key={purpose.code}>
                  {index > 0 ? <ListHairline /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${purpose.label}. ${purpose.description}`}
                    accessibilityState={{ selected }}
                    feedbackType="highlight"
                    onPress={() => handleSelectPurpose(purpose.code)}
                    style={groupedListStyles.row}
                  >
                    <View
                      style={[
                        groupedListStyles.disc,
                        {
                          backgroundColor: selected
                            ? colors.primaryTint
                            : colors.surfaceSubtle,
                        },
                      ]}
                    >
                      <Briefcase
                        size={LIST_ICON_SIZE}
                        color={selected ? colors.primary : colors.textSecondary}
                      />
                    </View>
                    <View style={styles.rowBody}>
                      <Text
                        variant="bodyStrong"
                        color={colors.ink}
                        maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      >
                        {purpose.label}
                      </Text>
                      <Text
                        variant="caption"
                        color={colors.textSecondary}
                        maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      >
                        {purpose.description}
                      </Text>
                    </View>
                    {selected ? (
                      <Check size={18} color={colors.primary} />
                    ) : (
                      <ChevronRight size={18} color={colors.textMuted} />
                    )}
                  </Pressable>
                </React.Fragment>
              );
            })}
          </GroupedList>
        </View>
      ) : null}

      {step === 'review' && selectedBranch && selectedSlot ? (
        <View style={styles.stepSection}>
          {reviewError ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={styles.errorAlertBox}
            >
              <AlertCircle size={18} color={colors.redText} />
              <Text
                variant="body"
                color={colors.redText}
                style={styles.flexText}
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
              >
                {reviewError}
              </Text>
            </View>
          ) : null}

          <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <Calendar size={24} color={colors.primary} />
              <Text
                variant="caption"
                color={colors.textSecondary}
                align="center"
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
              >
                Your appointment
              </Text>
              <Text
                variant="h2"
                color={colors.ink}
                align="center"
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
              >
                {formatManilaSlotWindow(selectedSlot.starts_at, selectedSlot.ends_at)}
              </Text>
              <Text
                variant="body"
                color={colors.textSecondary}
                align="center"
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
              >
                {formatManilaAppointmentDate(selectedDate)} · Philippine time
              </Text>
            </View>

            <View style={styles.reviewRows}>
              <View style={styles.reviewRow}>
                <Text
                  variant="body"
                  color={colors.textSecondary}
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                >
                  Branch
                </Text>
                <Text
                  variant="bodyStrong"
                  color={colors.ink}
                  style={styles.reviewValue}
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                >
                  {selectedBranch.name}
                </Text>
              </View>

              <View style={styles.reviewRow}>
                <Text
                  variant="body"
                  color={colors.textSecondary}
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                >
                  Area
                </Text>
                <Text
                  variant="bodyStrong"
                  color={colors.ink}
                  style={styles.reviewValue}
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                >
                  {selectedBranch.area}
                </Text>
              </View>

              <View style={styles.reviewRow}>
                <Text
                  variant="body"
                  color={colors.textSecondary}
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                >
                  Purpose
                </Text>
                <Text
                  variant="bodyStrong"
                  color={colors.ink}
                  style={styles.reviewValue}
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                >
                  {selectedPurposeOption?.label ?? 'General banking'}
                </Text>
              </View>

              <View style={styles.reviewRow}>
                <Text
                  variant="body"
                  color={colors.textSecondary}
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                >
                  Fee
                </Text>
                <Text
                  variant="bodyStrong"
                  color={colors.ink}
                  style={styles.reviewValue}
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                >
                  Free
                </Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  offlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tintOrange,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  stepSection: {
    gap: spacing.base,
  },
  skeletonStack: {
    gap: spacing.md,
  },
  rowBody: {
    flex: 1,
    gap: spacing.xs,
  },
  flexText: {
    flex: 1,
  },
  contextBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  changeButton: {
    minHeight: size.touch,
    minWidth: size.touch,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  slotTakenAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tintOrange,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  errorAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tintRed,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  reviewCard: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.base,
  },
  reviewHeader: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  reviewRows: {
    gap: spacing.md,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  reviewValue: {
    flex: 1,
    textAlign: 'right',
  },
});
