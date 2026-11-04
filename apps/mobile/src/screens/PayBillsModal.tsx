import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  colors,
  spacing,
  radius,
  formatCentavosToPHP,
  phpToCentavos,
  generateIdempotencyKey,
  toUserMessage,
  type AccountBalance,
  type Biller,
  type ScheduledPaymentFrequency,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';
import {
  BottomSheet,
  Text,
  TextField,
  AmountInput,
  Button,
  Card,
  Badge,
} from '../components';
import { BillerStep } from './pay-bills/BillerStep';
import { ReferenceStep } from './pay-bills/ReferenceStep';
import { WhenStep, type PaymentTiming } from './pay-bills/WhenStep';
import { ReviewStep } from './pay-bills/ReviewStep';
import { SuccessStep } from './pay-bills/SuccessStep';

interface PayBillsModalProps {
  visible: boolean;
  onClose: () => void;
  accounts: AccountBalance[];
  onPaymentSuccess: () => void;
}

type Step = 'biller' | 'reference' | 'amount' | 'when' | 'review' | 'success';

export function PayBillsModal({
  visible,
  onClose,
  accounts,
  onPaymentSuccess,
}: PayBillsModalProps) {
  const { confirmBiometricPayment } = useSettings();

  const [step, setStep] = useState<Step>('biller');
  const [billers, setBillers] = useState<Biller[]>([]);
  const [selectedBiller, setSelectedBiller] = useState<Biller | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [reference, setReference] = useState('');
  const [refError, setRefError] = useState<string | null>(null);

  const [amountStr, setAmountStr] = useState('');
  const [selectedAccountId] = useState<string>(accounts[0]?.account_id || '');

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

  const selectedAccount =
    accounts.find((a) => a.account_id === selectedAccountId) || accounts[0];

  useEffect(() => {
    if (visible) {
      loadBillers();
      resetForm();
    }
  }, [visible]);

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
  }, [amountStr, reference, selectedBiller?.id, selectedAccountId, step]);

  const hasInput =
    Boolean(selectedBiller || reference || amountStr) && step !== 'success';

  const handleRequestDismiss = () => {
    if (loading) return;

    if (step === 'success') {
      onClose();
      return;
    }

    if (hasInput) {
      Alert.alert('Discard this payment?', 'Your details will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onClose },
      ]);
    } else {
      onClose();
    }
  };

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
          `Format doesn't match requirement (Pattern: ${selectedBiller.reference_pattern})`
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
      setStep('when');
    }
  };

  const handleSubmitPayment = async () => {
    if (!selectedBiller || !selectedAccount) return;

    setLoading(true);
    setErrorMessage(null);

    // Biometric / Password verification before moving money (§Fix 6)
    const authenticated = await confirmBiometricPayment({
      title: timing === 'now' ? 'Authorize Bill Payment' : 'Authorize Scheduled Bill',
      message:
        timing === 'now'
          ? `Confirm payment of ${formatCentavosToPHP(centavos)} to ${selectedBiller.name}`
          : `Confirm scheduling payment of ${formatCentavosToPHP(centavos)} to ${selectedBiller.name}`,
    });

    if (!authenticated.success) {
      setLoading(false);
      if (authenticated.cancelled) {
        setErrorMessage(
          'Payment authorization was cancelled. You can retry whenever ready.'
        );
      } else {
        setErrorMessage(authenticated.error || 'Payment authorization failed.');
      }
      return;
    }

    try {
      if (timing === 'now') {
        const { data, error } = await supabase.rpc('pay_bill', {
          p_from_account: selectedAccount.account_id,
          p_biller_id: selectedBiller.id,
          p_biller_reference: reference.trim(),
          p_amount: centavos,
          p_idempotency_key: idempotencyKey,
        });

        if (error) {
          throw error;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setServerResult(data);
        setReceiptTxId(data?.id || data?.transaction_id || null);
        setStep('success');
        onPaymentSuccess();
      } else {
        const maxRuns =
          timing === 'recurring' && maxRunsStr ? parseInt(maxRunsStr, 10) : null;
        const { error } = await supabase.rpc('create_scheduled_payment', {
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
        });

        if (error) {
          throw error;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setStep('success');
        onPaymentSuccess();
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage(toUserMessage(err?.message, selectedAccount?.balance));
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      dismissible={!loading}
      onRequestDismiss={handleRequestDismiss}
      title={
        step === 'biller'
          ? 'Pay Bills'
          : step === 'reference'
            ? 'Account Details'
            : step === 'amount'
              ? 'Enter Amount'
              : step === 'when'
                ? 'Payment Schedule'
                : step === 'review'
                  ? 'Review Payment'
                  : 'Payment Result'
      }
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Step 1: Biller Selection */}
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

        {/* Step 2: Reference Number */}
        {step === 'reference' && selectedBiller && (
          <ReferenceStep
            biller={selectedBiller}
            reference={reference}
            refError={refError}
            onReferenceChange={(val) => {
              setReference(val);
              if (refError) validateReference(val);
            }}
            onBack={() => setStep('biller')}
            onContinue={handleReferenceContinue}
          />
        )}

        {/* Step 3: Amount */}
        {step === 'amount' && (
          <View style={styles.stepContainer}>
            <AmountInput
              value={amountStr}
              onChangeText={setAmountStr}
              availableBalanceCentavos={availableCentavos}
              error={
                centavos > availableCentavos
                  ? 'Amount exceeds available balance'
                  : undefined
              }
            />

            <View style={styles.buttonRow}>
              <Button
                title="Back"
                variant="ghost"
                onPress={() => setStep('reference')}
                style={styles.halfButton}
              />
              <Button
                title="Continue"
                variant="primary"
                onPress={handleAmountContinue}
                disabled={!isAmountValid}
                style={styles.halfButton}
              />
            </View>
          </View>
        )}

        {/* Step 4: When */}
        {step === 'when' && (
          <WhenStep
            timing={timing}
            onTimingChange={setTiming}
            scheduledDate={scheduledDate}
            onScheduledDateChange={setScheduledDate}
            frequency={frequency}
            onFrequencyChange={setFrequency}
            maxRunsStr={maxRunsStr}
            onMaxRunsChange={setMaxRunsStr}
            onBack={() => setStep('amount')}
            onContinue={() => {
              setErrorMessage(null);
              setStep('review');
            }}
          />
        )}

        {/* Step 5: Review */}
        {step === 'review' && selectedBiller && (
          <ReviewStep
            biller={selectedBiller}
            account={selectedAccount}
            reference={reference}
            centavos={centavos}
            timing={timing}
            scheduledDate={scheduledDate}
            frequency={frequency}
            loading={loading}
            errorMessage={errorMessage}
            onBack={() => setStep('when')}
            onSubmit={handleSubmitPayment}
          />
        )}

        {/* Step 6: Success */}
        {step === 'success' && selectedBiller && (
          <SuccessStep
            biller={selectedBiller}
            reference={reference}
            centavos={centavos}
            timing={timing}
            scheduledDate={scheduledDate}
            receiptTxId={receiptTxId}
            serverResult={serverResult}
            onDone={onClose}
          />
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing['2xl'],
  },
  stepContainer: {
    gap: spacing.base,
  },
  billerHeaderCard: {
    padding: spacing.base,
    backgroundColor: colors.primaryTint,
  },
  billerCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  billerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  billerTextContainer: {
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.base,
  },
  halfButton: {
    flex: 1,
  },
});
