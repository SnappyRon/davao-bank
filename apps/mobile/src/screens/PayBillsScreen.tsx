import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { useFeatureAccounts } from '../hooks/useFeatureAccounts';
import { AccountLoadStatus } from '../components/AccountLoadStatus';
import { StepUpSetupLink } from '../components/StepUpSetupLink';
import { retryStepUp } from '../utils/stepUpRetry';
import { useTotpPrompt } from '../context/PasswordPromptContext';
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  spacing,
  formatCentavosToPHP,
  phpToCentavos,
  generateIdempotencyKey,
  toUserMessage,
  type Biller,
  type ScheduledPaymentFrequency,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { isConfirmedRejection } from '../utils/resultReceipt';
import { ResultView } from '../components/ResultView';
import { useSettings } from '../context/SettingsContext';
import {
  FeatureScreen,
  AmountInput,
  Button,
  AccountStep,
  AccountPickerSheet,
  RecipientChip,
} from '../components';
import { commitButtonLabel, describeReferenceFormat } from '../utils/moneyFlow';
import { useInFlightGuard } from '../hooks/useInFlightGuard';
import { BillerStep, getCategoryIcon } from './pay-bills/BillerStep';
import { ReferenceStep } from './pay-bills/ReferenceStep';
import { WhenPicker, type PaymentTiming } from '../components/WhenPicker';
import { ReviewStep } from './pay-bills/ReviewStep';
import { SuccessStep } from './pay-bills/SuccessStep';

// Spec 7B.4: Amount and When are one step ('amount').
type Step = 'source' | 'biller' | 'reference' | 'amount' | 'review' | 'success';

export function PayBillsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const onClose = () => navigation.goBack();
  const { accounts, accountsLoading, accountError, loadAccounts } = useFeatureAccounts();

  const promptTotp = useTotpPrompt();
  const { confirmBiometricPayment, hideBalance } = useSettings();

  const [step, setStep] = useState<Step>('biller');
  const [billers, setBillers] = useState<Biller[]>([]);
  const [selectedBiller, setSelectedBiller] = useState<Biller | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [reference, setReference] = useState('');
  const [refError, setRefError] = useState<string | null>(null);

  const [amountStr, setAmountStr] = useState('');

  // When / Scheduling options
  const [timing, setTiming] = useState<PaymentTiming>('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [frequency, setFrequency] = useState<ScheduledPaymentFrequency>('monthly');
  const [maxRunsStr, setMaxRunsStr] = useState('');
  const [endDate] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [receiptTxId, setReceiptTxId] = useState<string | null>(null);
  const [serverResult, setServerResult] = useState<any>(null);
  const [resultError, setResultError] = useState<unknown>(null);

  // Source account: chosen in the first step when the user has 2+ accounts.
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const hasMultipleAccounts = accounts.length >= 2;
  const selectedAccount =
    accounts.find((a) => a.account_id === selectedAccountId) ?? accounts[0];
  const sourceStepPendingRef = useRef(true);
  // Step content renders only after the decision, so the wrong step never flashes.
  const [firstStepDecided, setFirstStepDecided] = useState(false);
  const guardMoneyAction = useInFlightGuard();

  // With 2+ accounts the source picker comes first (once, after accounts load).
  useEffect(() => {
    if (sourceStepPendingRef.current && !accountsLoading && accounts.length > 0) {
      sourceStepPendingRef.current = false;
      if (accounts.length >= 2) setStep('source');
      setFirstStepDecided(true);
    }
  }, [accountsLoading, accounts.length]);

  useEffect(() => {
    loadBillers();
    resetForm();
  }, []);

  const resetForm = () => {
    setStep('biller');
    setSelectedBiller(null);
    setSelectedCategory('all');
    setSearchQuery('');
    setReference('');
    setRefError(null);
    setAmountStr('');
    setTiming('now');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setScheduledDate(tomorrow.toISOString().split('T')[0]);
    setFrequency('monthly');
    setMaxRunsStr('12');
    setLoading(false);
    setErrorMessage(null);
    setServerResult(null);
    setReceiptTxId(null);
    setIdempotencyKey(generateIdempotencyKey('bill_payment'));
  };

  useEffect(() => {
    if (step !== 'success') {
      setIdempotencyKey(generateIdempotencyKey('bill_payment'));
    }
  }, [amountStr, reference, selectedBiller?.id, selectedAccount?.account_id, step]);

  const hasInput =
    Boolean(selectedBiller || reference || amountStr) && step !== 'success';

  const loadBillers = async () => {
    try {
      const { data, error } = await supabase
        .from('billers')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (data && !error) {
        setBillers(data as Biller[]);
      }
    } catch {
      // Fallback
    }
  };

  const validateReference = (val: string): boolean => {
    if (!selectedBiller) return false;
    const clean = val.trim();
    if (!clean) {
      setRefError(`${selectedBiller.reference_label} is required`);
      return false;
    }
    try {
      const regex = new RegExp(selectedBiller.reference_pattern);
      if (!regex.test(clean)) {
        setRefError(
          `Check the ${selectedBiller.reference_label.toLowerCase()}: ${describeReferenceFormat(selectedBiller.reference_pattern)}`
        );
        return false;
      }
    } catch {
      // Invalid regex pattern fallback
    }
    setRefError(null);
    return true;
  };

  const centavos = phpToCentavos(amountStr || '0');
  const availableCentavos = selectedAccount?.balance || 0;
  const isAmountValid = centavos > 0 && centavos <= availableCentavos;

  const handleSelectBiller = (biller: Biller) => {
    setSelectedBiller(biller);
    setReference('');
    setRefError(null);
    setStep('reference');
  };

  const handleReferenceContinue = () => {
    if (validateReference(reference)) {
      setStep('amount');
    }
  };

  const handleAmountContinue = () => {
    if (isAmountValid) {
      setErrorMessage(null);
      setStep('review');
    }
  };

  const handleSubmitPayment = async () => {
    if (!selectedBiller || !selectedAccount) return;

    setLoading(true);
    setErrorMessage(null);

    // Biometric / Password verification before moving money (§Fix 6)
    const authenticated = await confirmBiometricPayment({
      title: timing === 'now' ? 'Authorize bill payment' : 'Authorize scheduled bill',
      message:
        timing === 'now'
          ? `Confirm payment of ${formatCentavosToPHP(centavos)} to ${selectedBiller.name}`
          : `Confirm scheduling payment of ${formatCentavosToPHP(centavos)} to ${selectedBiller.name}`,
    });

    if (!authenticated.success) {
      setLoading(false);
      if (authenticated.cancelled) {
        setErrorMessage('Not authorized. Nothing was sent.');
      } else {
        setErrorMessage(authenticated.error || 'Payment authorization failed.');
      }
      return;
    }

    try {
      if (timing === 'now') {
        const { data, error } = await retryStepUp(
          () =>
            supabase.rpc('pay_bill', {
              p_from_account: selectedAccount.account_id,
              p_biller_id: selectedBiller.id,
              p_biller_reference: reference.trim(),
              p_amount: centavos,
              p_idempotency_key: idempotencyKey,
            }),
          promptTotp
        );

        if (error) {
          throw error;
        }

        setServerResult(data);
        setReceiptTxId(data?.id || data?.transaction_id || null);
        setStep('success');
      } else {
        const maxRuns =
          timing === 'recurring' && maxRunsStr ? parseInt(maxRunsStr, 10) : null;
        const { data, error } = await retryStepUp(
          () =>
            supabase.rpc('create_scheduled_payment', {
              p_from_account: selectedAccount.account_id,
              p_kind: 'bill',
              p_to_account: null,
              p_biller_id: selectedBiller.id,
              p_biller_reference: reference.trim(),
              p_amount: centavos,
              p_frequency: timing === 'recurring' ? frequency : 'once',
              p_start_date: scheduledDate,
              p_end_date: endDate || null,
              p_max_runs: maxRuns,
              p_note: `Bill: ${selectedBiller.name}`,
            }),
          promptTotp
        );

        if (error) {
          throw error;
        }

        setServerResult(data);
        setStep('success');
      }
    } catch (err: any) {
      setResultError(err);
      setErrorMessage(toUserMessage(err?.message, selectedAccount?.balance));
    } finally {
      setLoading(false);
    }
  };

  const inputSteps: Step[] = hasMultipleAccounts
    ? ['source', 'biller', 'reference', 'amount', 'review']
    : ['biller', 'reference', 'amount', 'review'];
  const stepIndex = inputSteps.indexOf(step);

  const handleSelectSource = (accountId: string) => {
    setAccountPickerOpen(false);
    setSelectedAccountId(accountId);
    setErrorMessage(null);
    if (step === 'source') {
      setStep('biller');
      return;
    }
    const account = accounts.find((a) => a.account_id === accountId);
    if (step === 'review' && account && centavos > account.balance) {
      setStep('amount');
    }
  };

  const commitAction = timing === 'now' ? 'pay' : 'schedule';
  const accountsReady =
    firstStepDecided && !accountsLoading && !accountError && accounts.length > 0;

  const footer =
    step === 'reference' ? (
      <Button
        title="Continue"
        onPress={handleReferenceContinue}
        disabled={!reference.trim()}
      />
    ) : step === 'amount' ? (
      <Button title="Continue" onPress={handleAmountContinue} disabled={!isAmountValid} />
    ) : step === 'review' ? (
      <Button
        title={commitButtonLabel(commitAction, centavos, loading)}
        onPress={() => void guardMoneyAction(handleSubmitPayment)}
        loading={loading}
      />
    ) : undefined;

  return (
    <FeatureScreen
      stepCount={step === 'success' ? undefined : inputSteps.length}
      isDirty={hasInput}
      isProcessing={loading}
      step={stepIndex >= 0 ? stepIndex + 1 : undefined}
      onPrevStep={() => {
        setErrorMessage(null);
        setStep(inputSteps[Math.max(stepIndex - 1, 0)]);
      }}
      title="Pay bills"
      footer={
        step !== 'success' && accountsReady && !isConfirmedRejection(resultError)
          ? footer
          : undefined
      }
    >
      <AccountLoadStatus
        loading={accountsLoading}
        empty={accounts.length === 0}
        error={accountError}
        onRetry={loadAccounts}
      />
      {isConfirmedRejection(resultError) ? (
        <ResultView
          outcome="failed"
          title="Not sent"
          onDone={() => setResultError(null)}
        />
      ) : (
        accountsReady && (
          <View style={styles.content}>
            {/* Step 0 (2+ accounts): source account */}
            {step === 'source' && (
              <AccountStep
                heading="Pay from"
                accounts={accounts}
                selectedAccountId={selectedAccount?.account_id ?? null}
                hideBalance={hideBalance}
                onSelect={handleSelectSource}
              />
            )}

            {/* Biller */}
            {step === 'biller' && (
              <BillerStep
                billers={billers}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                onSelectBiller={handleSelectBiller}
              />
            )}

            {/* Account number on the bill */}
            {step === 'reference' && selectedBiller && (
              <ReferenceStep
                biller={selectedBiller}
                reference={reference}
                refError={refError}
                onReferenceChange={(val) => {
                  setReference(val);
                  if (refError) validateReference(val);
                }}
              />
            )}

            {/* Amount and when (one step) */}
            {step === 'amount' && selectedBiller && (
              <View style={styles.stepContainer}>
                <RecipientChip
                  label={`To ${selectedBiller.name}`}
                  icon={getCategoryIcon(selectedBiller.category)}
                />
                <AmountInput
                  label="Amount"
                  value={amountStr}
                  onChangeText={setAmountStr}
                  presetAmounts={[500, 1000, 2000, 5000]}
                  helperText={`Available: ${hideBalance ? '₱••••••' : formatCentavosToPHP(availableCentavos)}`}
                  error={
                    centavos > availableCentavos
                      ? 'Amount exceeds available balance'
                      : undefined
                  }
                />
                <WhenPicker
                  timing={timing}
                  onTimingChange={setTiming}
                  scheduledDate={scheduledDate}
                  onScheduledDateChange={setScheduledDate}
                  frequency={frequency}
                  onFrequencyChange={setFrequency}
                  maxRunsStr={maxRunsStr}
                  onMaxRunsChange={setMaxRunsStr}
                />
              </View>
            )}

            {/* Review */}
            {step === 'review' && selectedBiller && (
              <ReviewStep
                biller={selectedBiller}
                account={selectedAccount}
                reference={reference}
                centavos={centavos}
                timing={timing}
                scheduledDate={scheduledDate}
                frequency={frequency}
                maxRunsStr={maxRunsStr}
                errorMessage={errorMessage}
                hideBalance={hideBalance}
                onChangeSource={
                  hasMultipleAccounts && !loading
                    ? () => setAccountPickerOpen(true)
                    : undefined
                }
              />
            )}

            {/* Result */}
            {step === 'success' && selectedBiller && (
              <SuccessStep
                biller={selectedBiller}
                reference={reference}
                centavos={centavos}
                timing={timing}
                scheduledDate={scheduledDate}
                receiptTxId={receiptTxId}
                serverResult={serverResult}
                hideBalance={hideBalance}
                onDone={onClose}
                onPayAgain={() => navigation.replace('PayBills')}
              />
            )}
          </View>
        )
      )}
      <StepUpSetupLink error={errorMessage} onClose={onClose} />
      <AccountPickerSheet
        visible={accountPickerOpen}
        accounts={accounts}
        selectedAccountId={selectedAccount?.account_id ?? null}
        hideBalance={hideBalance}
        onSelect={handleSelectSource}
        onClose={() => setAccountPickerOpen(false)}
        title="Pay from"
      />
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing['2xl'],
  },
  stepContainer: {
    gap: spacing.base,
  },
});
