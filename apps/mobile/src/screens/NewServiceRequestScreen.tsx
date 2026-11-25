import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ChevronDown,
  Check,
  FileText,
  Award,
  CreditCard,
  UserCheck,
  Globe,
  Wallet,
} from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  size,
  fetchAccountBalances,
  createServiceRequest,
  formatReferenceId,
  validateServiceRequestDraft,
  normalizeRemitReference,
  serviceRequestTypeLabel,
  serviceRequestTypeDescription,
  serviceRequestStatusLabel,
  toServiceRequestErrorMessage,
  SERVICE_REQUEST_TYPES,
  SERVICE_REQUEST_SIMULATION_BADGE,
  SERVICE_REQUEST_SIMULATION_NOTICE,
  REMIT_REQUEST_SIMULATION_NOTICE,
  type AccountBalance,
  type AccountUpdateField,
  type CreateServiceRequestResult,
  type ServiceRequestDetails,
  type ServiceRequestFieldErrors,
  type ServiceRequestType,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { reportNetworkResult } from '../lib/networkStatus';
import { MASCOT_EMPTY } from '../assets/illustrations';
import { useSettings } from '../context/SettingsContext';
import { useInFlightGuard } from '../hooks/useInFlightGuard';
import { formatPlainDate, REVIEW_FOOTNOTE } from '../utils/moneyFlow';
import {
  FeatureScreen,
  Sheet,
  Text,
  Button,
  Badge,
  Chip,
  TextField,
  Pressable,
  EmptyState,
  Skeleton,
  ResultView,
  AccountPickerSheet,
  GroupedList,
  ListHairline,
  formatAccountLabel,
  groupedListStyles,
  LIST_ICON_SIZE,
  type ResultDetailRow,
} from '../components';
import type { ServiceRequestsStackParamList } from './ServiceRequestsScreen';

type ScreenStage = 'form' | 'review' | 'result';
type StatementPreset = 'this_month' | 'last_month' | 'last_3_months' | 'custom';

const CERTIFICATE_PURPOSES = [
  'Visa application',
  'Employment',
  'School requirement',
  'Financial proof',
] as const;

const CARD_REASONS = [
  'Lost card',
  'Damaged card',
  'Captured at ATM',
  'Expired card',
] as const;

function computePresetDates(preset: Exclude<StatementPreset, 'custom'>): {
  start: string;
  end: string;
} {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const toYMD = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (preset === 'this_month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: toYMD(first), end: toYMD(now) };
  }
  if (preset === 'last_month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: toYMD(first), end: toYMD(last) };
  }
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return { start: toYMD(threeMonthsAgo), end: toYMD(now) };
}

function renderTypeIcon(type: ServiceRequestType, selected = false) {
  const iconColor = selected ? colors.textInverse : colors.primary;
  switch (type) {
    case 'statement':
      return <FileText size={LIST_ICON_SIZE} color={iconColor} />;
    case 'certificate':
      return <Award size={LIST_ICON_SIZE} color={iconColor} />;
    case 'card_replacement':
      return <CreditCard size={LIST_ICON_SIZE} color={iconColor} />;
    case 'account_update':
      return <UserCheck size={LIST_ICON_SIZE} color={iconColor} />;
    case 'remit_status':
      return <Globe size={LIST_ICON_SIZE} color={iconColor} />;
  }
}

export function NewServiceRequestScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<ServiceRequestsStackParamList>>();
  const route = useRoute<RouteProp<ServiceRequestsStackParamList, 'NewServiceRequest'>>();
  const { hideBalance } = useSettings();
  const guardSubmit = useInFlightGuard();

  const initialDates = useMemo(() => computePresetDates('this_month'), []);

  const [stage, setStage] = useState<ScreenStage>('form');
  const [selectedType, setSelectedType] = useState<ServiceRequestType>(
    route.params?.initialType ?? 'statement'
  );
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);

  // Statement fields
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [statementPreset, setStatementPreset] = useState<StatementPreset>('this_month');
  const [startDate, setStartDate] = useState(initialDates.start);
  const [endDate, setEndDate] = useState(initialDates.end);

  // Certificate fields
  const [purpose, setPurpose] = useState('');

  // Card replacement fields
  const [reason, setReason] = useState('');
  const [last4, setLast4] = useState('');

  // Account update fields
  const [updateField, setUpdateField] = useState<AccountUpdateField>('email');
  const [newValue, setNewValue] = useState('');

  // Remittance status fields
  const [remitReference, setRemitReference] = useState('');

  // Validation & submission state
  const [fieldErrors, setFieldErrors] = useState<ServiceRequestFieldErrors>({});
  const [validatedDetails, setValidatedDetails] = useState<ServiceRequestDetails | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] =
    useState<CreateServiceRequestResult | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadAccounts = useCallback(async () => {
    if (mountedRef.current) {
      setAccountsLoading(true);
      setAccountError(null);
    }
    try {
      const { data, error } = await fetchAccountBalances(supabase);
      reportNetworkResult(error);
      if (!mountedRef.current) return;
      if (error) {
        setAccountError(toServiceRequestErrorMessage(error, 'load'));
        setAccounts([]);
      } else {
        const list = data ?? [];
        setAccounts(list);
        setSelectedAccountId((prev) =>
          prev && list.some((a) => a.account_id === prev)
            ? prev
            : (list[0]?.account_id ?? '')
        );
      }
    } catch (err: unknown) {
      reportNetworkResult(err);
      if (mountedRef.current) {
        setAccountError(toServiceRequestErrorMessage(err, 'load'));
        setAccounts([]);
      }
    } finally {
      if (mountedRef.current) {
        setAccountsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const selectedAccount =
    accounts.find((a) => a.account_id === selectedAccountId) ?? accounts[0] ?? null;

  const isDirty =
    stage !== 'result' &&
    (stage === 'review' ||
      purpose.trim().length > 0 ||
      reason.trim().length > 0 ||
      last4.trim().length > 0 ||
      newValue.trim().length > 0 ||
      remitReference.trim().length > 0 ||
      statementPreset === 'custom');

  const simulationNotice =
    selectedType === 'remit_status'
      ? REMIT_REQUEST_SIMULATION_NOTICE
      : SERVICE_REQUEST_SIMULATION_NOTICE;

  // The validation message is user-facing copy, never an account UUID.
  const accountSelectionError = fieldErrors.accountId;

  const handleSelectType = (type: ServiceRequestType) => {
    setSelectedType(type);
    setFieldErrors({});
    setSubmitError(null);
    setTypeSheetOpen(false);
  };

  const handleSelectPreset = (preset: StatementPreset) => {
    setStatementPreset(preset);
    setFieldErrors((prev) => ({
      ...prev,
      startDate: undefined,
      endDate: undefined,
    }));
    if (preset !== 'custom') {
      const dates = computePresetDates(preset);
      setStartDate(dates.start);
      setEndDate(dates.end);
    }
  };

  const handleContinueToReview = () => {
    setSubmitError(null);
    const outcome = validateServiceRequestDraft({
      type: selectedType,
      accountId: selectedAccount?.account_id ?? '',
      startDate,
      endDate,
      purpose,
      reason,
      last4,
      updateField,
      newValue,
      remitReference,
    });

    if (!outcome.valid) {
      setFieldErrors(outcome.errors);
      return;
    }

    setFieldErrors({});
    setValidatedDetails(outcome.details);
    setStage('review');
  };

  const handleSubmit = async () => {
    if (!validatedDetails) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const { data, error } = await createServiceRequest(supabase, {
        type: selectedType,
        details: validatedDetails,
      });
      reportNetworkResult(error);
      if (!mountedRef.current) return;

      if (error || !data) {
        setSubmitError(toServiceRequestErrorMessage(error, 'action'));
        return;
      }

      setSubmittedResult(data);
      setStage('result');
    } catch (err: unknown) {
      reportNetworkResult(err);
      if (mountedRef.current) {
        setSubmitError(toServiceRequestErrorMessage(err, 'action'));
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const reviewRows = useMemo((): ResultDetailRow[] => {
    const rows: ResultDetailRow[] = [
      { label: 'Request type', value: serviceRequestTypeLabel(selectedType) },
    ];
    switch (selectedType) {
      case 'statement':
        if (selectedAccount) {
          rows.push({
            label: 'Account',
            value: formatAccountLabel(selectedAccount),
          });
        }
        rows.push({
          label: 'Period',
          value: `${formatPlainDate(startDate)} to ${formatPlainDate(endDate)}`,
        });
        break;
      case 'certificate':
        rows.push({ label: 'Purpose', value: purpose.trim() });
        break;
      case 'card_replacement':
        rows.push({ label: 'Reason', value: reason.trim() });
        if (last4.trim()) {
          rows.push({ label: 'Card ending', value: `•• ${last4.trim()}` });
        }
        break;
      case 'account_update':
        rows.push({
          label: 'Field to update',
          value: updateField === 'email' ? 'Email address' : 'Mobile number',
        });
        rows.push({ label: 'Requested value', value: newValue.trim() });
        break;
      case 'remit_status':
        rows.push({
          label: 'Remittance reference',
          value: normalizeRemitReference(remitReference),
        });
        break;
    }
    rows.push({ label: 'Fee', value: 'Free (simulation)' });
    return rows;
  }, [
    selectedType,
    selectedAccount,
    startDate,
    endDate,
    purpose,
    reason,
    last4,
    updateField,
    newValue,
    remitReference,
  ]);

  if (stage === 'result' && submittedResult) {
    const refCode = formatReferenceId(
      (submittedResult.reference || '').replace(/^DB-/i, '') || submittedResult.id
    );
    const resultDetails: ResultDetailRow[] = [
      { label: 'Reference', value: refCode },
      { label: 'Status', value: serviceRequestStatusLabel(submittedResult.status) },
      ...reviewRows,
    ];

    return (
      <FeatureScreen title="Request submitted" isDirty={false} isProcessing={false}>
        <View style={styles.resultWrapper}>
          <View style={styles.centeredBadgeRow}>
            <Badge
              label={SERVICE_REQUEST_SIMULATION_BADGE}
              variant="warning"
              testID="result-simulation-badge"
            />
          </View>
          <ResultView
            outcome="request_sent"
            title="Request submitted"
            subtitle={simulationNotice}
            details={resultDetails}
            onDone={() => navigation.goBack()}
          />
        </View>
      </FeatureScreen>
    );
  }

  const statementBlocked =
    selectedType === 'statement' &&
    (accountsLoading || Boolean(accountError) || accounts.length === 0);

  const footer =
    stage === 'form' ? (
      <Button
        title="Review request"
        variant="primary"
        disabled={statementBlocked}
        onPress={handleContinueToReview}
      />
    ) : (
      <Button
        title={submitting ? 'Submitting…' : 'Submit request'}
        variant="primary"
        loading={submitting}
        disabled={submitting}
        onPress={() => {
          void guardSubmit(handleSubmit);
        }}
      />
    );

  return (
    <FeatureScreen
      title="New service request"
      step={stage === 'form' ? 1 : 2}
      stepCount={2}
      onPrevStep={() => {
        setSubmitError(null);
        setStage('form');
      }}
      isDirty={isDirty}
      isProcessing={submitting}
      footer={footer}
    >
      <View style={styles.container}>
        <View style={styles.simulationBanner}>
          <Badge
            label={SERVICE_REQUEST_SIMULATION_BADGE}
            variant="warning"
            testID="new-service-request-simulation-badge"
          />
          <Text
            variant="caption"
            color={colors.textSecondary}
            maxFontSizeMultiplier={1.4}
          >
            {simulationNotice}
          </Text>
        </View>

        {stage === 'form' ? (
          <View style={styles.formSection}>
            <View style={styles.fieldBlock}>
              <Text variant="label" color={colors.ink}>
                Request type
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Request type: ${serviceRequestTypeLabel(selectedType)}. Change request type`}
                feedbackType="highlight"
                onPress={() => setTypeSheetOpen(true)}
                style={styles.selectorRow}
              >
                <View style={styles.selectorIconDisc}>
                  {renderTypeIcon(selectedType)}
                </View>
                <View style={styles.selectorTextCol}>
                  <Text
                    variant="bodyStrong"
                    color={colors.ink}
                    maxFontSizeMultiplier={1.4}
                  >
                    {serviceRequestTypeLabel(selectedType)}
                  </Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    {serviceRequestTypeDescription(selectedType)}
                  </Text>
                </View>
                <ChevronDown size={20} color={colors.primary} />
              </Pressable>
            </View>

            {selectedType === 'statement' ? (
              <View style={styles.typeFields}>
                <Text variant="label" color={colors.ink}>
                  Account
                </Text>
                {accountsLoading ? (
                  <View
                    style={styles.accountSkeletonBox}
                    accessibilityLabel="Loading accounts"
                  >
                    <Skeleton width="100%" height={64} borderRadius={radius.md} />
                  </View>
                ) : accountError ? (
                  <View style={styles.accountErrorBox}>
                    <Text variant="body" color={colors.redText} accessibilityRole="alert">
                      {accountError}
                    </Text>
                    <Button
                      title="Try again"
                      variant="secondary"
                      onPress={() => void loadAccounts()}
                    />
                  </View>
                ) : accounts.length === 0 ? (
                  <EmptyState
                    title="No active accounts"
                    description="An active Davao Bank account is needed to request a statement copy."
                    illustration={MASCOT_EMPTY}
                    scrollable={false}
                  />
                ) : (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Account: ${selectedAccount ? formatAccountLabel(selectedAccount) : 'Choose account'}. Change account`}
                      feedbackType="highlight"
                      onPress={() => setAccountPickerOpen(true)}
                      style={styles.selectorRow}
                    >
                      <View style={styles.selectorIconDisc}>
                        <Wallet size={LIST_ICON_SIZE} color={colors.primary} />
                      </View>
                      <View style={styles.selectorTextCol}>
                        <Text
                          variant="bodyStrong"
                          color={colors.ink}
                          maxFontSizeMultiplier={1.4}
                        >
                          {selectedAccount
                            ? formatAccountLabel(selectedAccount)
                            : 'Choose account'}
                        </Text>
                      </View>
                      <ChevronDown size={20} color={colors.primary} />
                    </Pressable>

                    {accountSelectionError ? (
                      <Text
                        variant="caption"
                        color={colors.redText}
                        accessibilityRole="alert"
                      >
                        {accountSelectionError}
                      </Text>
                    ) : null}

                    <Text variant="label" color={colors.ink} style={styles.subLabel}>
                      Statement period
                    </Text>
                    <View style={styles.chipsWrap}>
                      {(
                        [
                          { id: 'this_month', label: 'This month' },
                          { id: 'last_month', label: 'Last month' },
                          { id: 'last_3_months', label: 'Last 3 months' },
                          { id: 'custom', label: 'Custom' },
                        ] as const
                      ).map((opt) => (
                        <Chip
                          key={opt.id}
                          label={opt.label}
                          selected={statementPreset === opt.id}
                          onPress={() => handleSelectPreset(opt.id)}
                          style={styles.wrapChip}
                        />
                      ))}
                    </View>

                    <TextField
                      label="Start date"
                      value={startDate}
                      onChangeText={(text) => {
                        setStatementPreset('custom');
                        setStartDate(text);
                        if (fieldErrors.startDate) {
                          setFieldErrors((prev) => ({ ...prev, startDate: undefined }));
                        }
                      }}
                      placeholder="YYYY-MM-DD"
                      autoCapitalize="none"
                      helperText="Format: YYYY-MM-DD"
                      error={fieldErrors.startDate}
                    />

                    <TextField
                      label="End date"
                      value={endDate}
                      onChangeText={(text) => {
                        setStatementPreset('custom');
                        setEndDate(text);
                        if (fieldErrors.endDate) {
                          setFieldErrors((prev) => ({ ...prev, endDate: undefined }));
                        }
                      }}
                      placeholder="YYYY-MM-DD"
                      autoCapitalize="none"
                      helperText="Format: YYYY-MM-DD"
                      error={fieldErrors.endDate}
                    />
                  </>
                )}
              </View>
            ) : null}

            {selectedType === 'certificate' ? (
              <View style={styles.typeFields}>
                <Text variant="label" color={colors.ink}>
                  Common purposes
                </Text>
                <View style={styles.chipsWrap}>
                  {CERTIFICATE_PURPOSES.map((item) => (
                    <Chip
                      key={item}
                      label={item}
                      selected={purpose.trim() === item}
                      onPress={() => {
                        setPurpose(item);
                        setFieldErrors((prev) => ({ ...prev, purpose: undefined }));
                      }}
                      style={styles.wrapChip}
                    />
                  ))}
                </View>
                <TextField
                  label="Purpose"
                  value={purpose}
                  onChangeText={(text) => {
                    setPurpose(text);
                    if (fieldErrors.purpose) {
                      setFieldErrors((prev) => ({ ...prev, purpose: undefined }));
                    }
                  }}
                  placeholder="e.g. Visa application"
                  maxLength={120}
                  helperText="Describe what this demo certificate is for (up to 120 characters)."
                  error={fieldErrors.purpose}
                />
              </View>
            ) : null}

            {selectedType === 'card_replacement' ? (
              <View style={styles.typeFields}>
                <Text variant="label" color={colors.ink}>
                  Common reasons
                </Text>
                <View style={styles.chipsWrap}>
                  {CARD_REASONS.map((item) => (
                    <Chip
                      key={item}
                      label={item}
                      selected={reason.trim() === item}
                      onPress={() => {
                        setReason(item);
                        setFieldErrors((prev) => ({ ...prev, reason: undefined }));
                      }}
                      style={styles.wrapChip}
                    />
                  ))}
                </View>
                <TextField
                  label="Reason for replacement"
                  value={reason}
                  onChangeText={(text) => {
                    setReason(text);
                    if (fieldErrors.reason) {
                      setFieldErrors((prev) => ({ ...prev, reason: undefined }));
                    }
                  }}
                  placeholder="e.g. Lost card"
                  maxLength={120}
                  error={fieldErrors.reason}
                />
                <TextField
                  label="Card last 4 digits (optional)"
                  value={last4}
                  onChangeText={(text) => {
                    const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 4);
                    setLast4(digitsOnly);
                    if (fieldErrors.last4) {
                      setFieldErrors((prev) => ({ ...prev, last4: undefined }));
                    }
                  }}
                  placeholder="1234"
                  keyboardType="number-pad"
                  maxLength={4}
                  helperText="Optional — last 4 digits only. Never enter a full card number."
                  error={fieldErrors.last4}
                />
              </View>
            ) : null}

            {selectedType === 'account_update' ? (
              <View style={styles.typeFields}>
                <Text variant="label" color={colors.ink}>
                  Detail to update
                </Text>
                <View style={styles.segmentedRow}>
                  {(
                    [
                      { id: 'email', label: 'Email address' },
                      { id: 'phone_number', label: 'Mobile number' },
                    ] as const
                  ).map((opt) => {
                    const isSelected = updateField === opt.id;
                    return (
                      <Pressable
                        key={opt.id}
                        accessibilityRole="button"
                        accessibilityLabel={opt.label}
                        accessibilityState={{ selected: isSelected }}
                        feedbackType="scale"
                        onPress={() => {
                          setUpdateField(opt.id);
                          setNewValue('');
                          setFieldErrors((prev) => ({ ...prev, newValue: undefined }));
                        }}
                        style={[
                          styles.segmentBtn,
                          isSelected && styles.segmentBtnSelected,
                        ]}
                      >
                        <Text
                          variant="label"
                          color={isSelected ? colors.primary : colors.ink}
                          maxFontSizeMultiplier={1.4}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <TextField
                  label={
                    updateField === 'email' ? 'New email address' : 'New mobile number'
                  }
                  value={newValue}
                  onChangeText={(text) => {
                    setNewValue(text);
                    if (fieldErrors.newValue) {
                      setFieldErrors((prev) => ({ ...prev, newValue: undefined }));
                    }
                  }}
                  placeholder={
                    updateField === 'email' ? 'name@example.com' : '+63 917 123 4567'
                  }
                  keyboardType={updateField === 'email' ? 'email-address' : 'phone-pad'}
                  autoCapitalize="none"
                  helperText="Demo only — your sign-in email and profile phone number are not changed."
                  error={fieldErrors.newValue}
                />
              </View>
            ) : null}

            {selectedType === 'remit_status' ? (
              <View style={styles.typeFields}>
                <TextField
                  label="Remittance reference"
                  value={remitReference}
                  onChangeText={(text) => {
                    setRemitReference(text);
                    if (fieldErrors.remitReference) {
                      setFieldErrors((prev) => ({ ...prev, remitReference: undefined }));
                    }
                  }}
                  placeholder="DB-1A2B-3C4D"
                  autoCapitalize="characters"
                  helperText="Enter a sample reference in DB-XXXX-XXXX format."
                  error={fieldErrors.remitReference}
                />
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.reviewSection}>
            <View style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <Text variant="caption" color={colors.textSecondary} align="center">
                  {"You're requesting"}
                </Text>
                <Text
                  variant="h2"
                  color={colors.ink}
                  align="center"
                  maxFontSizeMultiplier={1.4}
                >
                  {serviceRequestTypeLabel(selectedType)}
                </Text>
              </View>

              <View style={styles.reviewRows}>
                {reviewRows.map((row) => (
                  <View key={row.label} style={styles.reviewRow}>
                    <Text
                      variant="body"
                      color={colors.textSecondary}
                      style={styles.reviewLabel}
                    >
                      {row.label}
                    </Text>
                    <Text
                      variant="bodyStrong"
                      color={colors.ink}
                      align="right"
                      style={styles.reviewValue}
                    >
                      {row.value}
                    </Text>
                  </View>
                ))}
              </View>

              <Text variant="caption" color={colors.textMuted} align="center">
                {REVIEW_FOOTNOTE}
              </Text>
            </View>

            {submitError ? (
              <View style={styles.submitErrorBox}>
                <Text
                  variant="body"
                  color={colors.redText}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                >
                  {submitError}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </View>

      <Sheet
        visible={typeSheetOpen}
        onClose={() => setTypeSheetOpen(false)}
        title="Choose request type"
      >
        <GroupedList>
          {SERVICE_REQUEST_TYPES.map((typeOption, index) => {
            const selected = typeOption === selectedType;
            const titleText = serviceRequestTypeLabel(typeOption);
            const descText = serviceRequestTypeDescription(typeOption);
            return (
              <View key={typeOption}>
                {index > 0 ? <ListHairline /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={titleText}
                  accessibilityState={{ selected }}
                  feedbackType="highlight"
                  onPress={() => handleSelectType(typeOption)}
                  style={groupedListStyles.row}
                >
                  <View
                    style={[
                      groupedListStyles.disc,
                      styles.sheetTypeDisc,
                      selected && styles.sheetTypeDiscSelected,
                    ]}
                  >
                    {renderTypeIcon(typeOption, selected)}
                  </View>
                  <View style={styles.sheetRowTextCol}>
                    <Text variant="bodyStrong" color={colors.ink}>
                      {titleText}
                    </Text>
                    <Text variant="caption" color={colors.textSecondary}>
                      {descText}
                    </Text>
                  </View>
                  <View style={styles.sheetCheckCol}>
                    {selected ? (
                      <Check size={LIST_ICON_SIZE} color={colors.primary} />
                    ) : null}
                  </View>
                </Pressable>
              </View>
            );
          })}
        </GroupedList>
      </Sheet>

      <AccountPickerSheet
        visible={accountPickerOpen}
        accounts={accounts}
        selectedAccountId={selectedAccount?.account_id ?? null}
        hideBalance={hideBalance}
        onSelect={(id) => {
          setSelectedAccountId(id);
          setFieldErrors((prev) => ({ ...prev, accountId: undefined }));
          setAccountPickerOpen(false);
        }}
        onClose={() => setAccountPickerOpen(false)}
      />
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  simulationBanner: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.base,
    gap: spacing.xs,
  },
  formSection: {
    gap: spacing.lg,
  },
  fieldBlock: {
    gap: spacing.xs,
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: size.touch,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  selectorIconDisc: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorTextCol: {
    flex: 1,
    gap: spacing.xs,
  },
  typeFields: {
    gap: spacing.md,
  },
  subLabel: {
    marginTop: spacing.xs,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  wrapChip: {
    marginRight: 0,
  },
  accountSkeletonBox: {
    paddingVertical: spacing.xs,
  },
  accountErrorBox: {
    backgroundColor: colors.tintRed,
    borderRadius: radius.md,
    padding: spacing.base,
    gap: spacing.md,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segmentBtn: {
    flex: 1,
    minHeight: size.touch,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnSelected: {
    backgroundColor: colors.primaryTint,
    borderColor: colors.primary,
  },
  reviewSection: {
    gap: spacing.base,
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
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  reviewLabel: {
    flexShrink: 0,
  },
  reviewValue: {
    flex: 1,
  },
  submitErrorBox: {
    backgroundColor: colors.tintRed,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  resultWrapper: {
    gap: spacing.md,
  },
  centeredBadgeRow: {
    alignItems: 'center',
  },
  sheetTypeDisc: {
    backgroundColor: colors.primaryTint,
  },
  sheetTypeDiscSelected: {
    backgroundColor: colors.primary,
  },
  sheetRowTextCol: {
    flex: 1,
    gap: spacing.xs,
  },
  sheetCheckCol: {
    width: LIST_ICON_SIZE,
    alignItems: 'flex-end',
  },
});
