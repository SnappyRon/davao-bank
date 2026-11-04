import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, ScrollView, Alert } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  colors,
  spacing,
  radius,
  formatCentavosToPHP,
  phpToCentavos,
  generateIdempotencyKey,
  executeTransfer,
  toUserMessage,
  type AccountBalance,
  type MoneyOperationResult,
  type SavedRecipient,
  type ScheduledPaymentFrequency,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';
import { BottomSheet, Text, Card } from '../components';
import {
  TransferRecipientStep,
  type RecipientTab,
} from './transfer/TransferRecipientStep';
import { TransferAmountStep, type TransferTiming } from './transfer/TransferAmountStep';
import { TransferReviewStep } from './transfer/TransferReviewStep';
import { TransferSuccessStep } from './transfer/TransferSuccessStep';

interface TransferModalProps {
  visible: boolean;
  onClose: () => void;
  accounts: AccountBalance[];
  onTransferSuccess: (result: MoneyOperationResult) => void;
  initialRecipientAccount?: string;
  initialAmountCentavos?: number;
  initialNote?: string;
  onRequestMoneyPress?: () => void;
}

type TransferStep = 'recipient' | 'amount' | 'review' | 'success';

export function TransferModal({
  visible,
  onClose,
  accounts,
  onTransferSuccess,
  initialRecipientAccount,
  initialAmountCentavos,
  initialNote,
  onRequestMoneyPress,
}: TransferModalProps) {
  const { hideBalance, confirmBiometricPayment } = useSettings();

  const [step, setStep] = useState<TransferStep>('recipient');
  const [recipientTab, setRecipientTab] = useState<RecipientTab>('saved');
  const [selectedAccountId] = useState<string>(accounts[0]?.account_id || '');
  const [recipientAccountNumber, setRecipientAccountNumber] = useState('');
  const [recipientNickname, setRecipientNickname] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [reference, setReference] = useState('');

  // Save recipient checkbox for new numbers
  const [shouldSaveRecipient, setShouldSaveRecipient] = useState(false);
  const [saveNickname, setSaveNickname] = useState('');

  // Saved recipients
  const [savedRecipients, setSavedRecipients] = useState<SavedRecipient[]>([]);

  // Timing & Scheduling (§C.4)
  const [timing, setTiming] = useState<TransferTiming>('now');
  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [frequency, setFrequency] = useState<ScheduledPaymentFrequency>('monthly');
  const [maxRunsStr, setMaxRunsStr] = useState('12');
  const [isScheduledSuccess, setIsScheduledSuccess] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<MoneyOperationResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const selectedAccount =
    accounts.find((a) => a.account_id === selectedAccountId) || accounts[0];

  const otherAccounts = accounts.filter(
    (a) => a.account_id !== selectedAccount?.account_id
  );

  const loadSavedRecipients = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('saved_recipients')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) {
        setSavedRecipients(data);
        if (data.length === 0 && otherAccounts.length > 0) {
          setRecipientTab('my_accounts');
        } else if (data.length === 0) {
          setRecipientTab('new');
        }
      }
    } catch {
      // Ignored
    }
  }, [otherAccounts.length]);

  const prevVisibleRef = useRef(false);

  // §0.9 Item 5: Regenerate idempotency key whenever payload changes (only before success)
  useEffect(() => {
    if (step !== 'success') {
      setIdempotencyKey(generateIdempotencyKey('transfer'));
    }
  }, [amountStr, recipientAccountNumber, reference, selectedAccountId, step]);

  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;

    // Reset or apply QR prefill ONLY when visible transitions from false to true
    if (!wasVisible && visible) {
      loadSavedRecipients();
      if (initialRecipientAccount) {
        const cleaned = initialRecipientAccount.trim();
        setRecipientAccountNumber(cleaned);
        const currentSource =
          accounts.find((a) => a.account_id === selectedAccountId) || accounts[0];
        // §0.9 Item 3: recipient checks on QR prefill (10 digits, not same account)
        if (cleaned.length !== 10 || !/^\d{10}$/.test(cleaned)) {
          setErrorMessage('Invalid QR recipient account: must be exactly 10 digits.');
          setStep('recipient');
        } else if (currentSource && cleaned === currentSource.account_number) {
          setErrorMessage('Cannot transfer to the same account');
          setStep('recipient');
        } else if (initialAmountCentavos && initialAmountCentavos > 0) {
          setAmountStr((initialAmountCentavos / 100).toFixed(2));
          if (initialNote) setReference(initialNote);
          // §0.9 Item 3: Generate idempotency key on QR prefill path too
          setIdempotencyKey(generateIdempotencyKey('transfer'));
          setStep('review');
        } else {
          setStep('amount');
        }
      } else {
        // §0.9 Item 1: Every money modal resets to step 1 whenever visible becomes true
        setStep('recipient');
        setRecipientAccountNumber('');
        setRecipientNickname('');
        setAmountStr('');
        setReference('');
        setShouldSaveRecipient(false);
        setSaveNickname('');
        setTiming('now');
        setIsScheduledSuccess(false);
        setErrorMessage(null);
        setSuccessResult(null);
        setIdempotencyKey(generateIdempotencyKey('transfer'));
      }
    }
  }, [visible]);

  const resetState = () => {
    setStep('recipient');
    setRecipientAccountNumber('');
    setRecipientNickname('');
    setAmountStr('');
    setReference('');
    setShouldSaveRecipient(false);
    setSaveNickname('');
    setTiming('now');
    setIsScheduledSuccess(false);
    setErrorMessage(null);
    setSuccessResult(null);
    setIdempotencyKey('');
    onClose();
  };

  // §0.9 Item 2: Confirmation before discarding flow with input on any step
  const hasInput =
    Boolean(recipientAccountNumber || amountStr || reference) && step !== 'success';

  const handleRequestDismiss = () => {
    if (loading) return; // In-flight request cannot be dismissed

    if (step === 'success') {
      resetState();
      return;
    }

    if (hasInput) {
      Alert.alert('Discard this transfer?', 'Your details will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: resetState },
      ]);
    } else {
      resetState();
    }
  };

  const handleSelectOwnAccount = (acc: AccountBalance) => {
    setRecipientAccountNumber(acc.account_number);
    setRecipientNickname(`${acc.type.toUpperCase()} (${acc.account_number.slice(-4)})`);
    setErrorMessage(null);
    setStep('amount');
  };

  const handleSelectSavedRecipient = (rec: SavedRecipient) => {
    setRecipientAccountNumber(rec.account_number);
    setRecipientNickname(rec.nickname);
    setErrorMessage(null);
    setStep('amount');
  };

  const handleNextFromRecipient = () => {
    setErrorMessage(null);
    const cleaned = recipientAccountNumber.trim();
    if (!cleaned) {
      setErrorMessage('Please enter or select an account number');
      return;
    }
    if (selectedAccount && cleaned === selectedAccount.account_number) {
      setErrorMessage('Cannot transfer to the same account');
      return;
    }
    setStep('amount');
  };

  const handleNextFromAmount = () => {
    setErrorMessage(null);
    const centavos = phpToCentavos(amountStr);
    if (centavos <= 0) {
      setErrorMessage('Amount must be greater than ₱0.00');
      return;
    }
    if (selectedAccount && centavos > selectedAccount.balance) {
      setErrorMessage('Insufficient funds in selected source account');
      return;
    }

    if (!idempotencyKey) {
      setIdempotencyKey(generateIdempotencyKey('transfer'));
    }
    setStep('review');
  };

  const handleConfirmTransfer = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    setErrorMessage(null);

    const centavos = phpToCentavos(amountStr);

    const bioMessage =
      timing === 'now'
        ? `Confirm transfer of ${formatCentavosToPHP(centavos)} to account ${recipientAccountNumber}`
        : `Confirm scheduling transfer of ${formatCentavosToPHP(centavos)} to account ${recipientAccountNumber}`;

    const bioResult = await confirmBiometricPayment({
      title: timing === 'now' ? 'Authorize Transfer' : 'Authorize Scheduled Transfer',
      message: bioMessage,
    });

    if (!bioResult.success) {
      setLoading(false);
      if (bioResult.cancelled) {
        setErrorMessage(
          'Transfer authorization was cancelled. You can retry whenever ready.'
        );
      } else {
        setErrorMessage(bioResult.error || 'Transfer authorization failed.');
      }
      return;
    }

    if (timing === 'now') {
      await executeServerTransfer(centavos);
    } else {
      await executeScheduledTransfer(centavos);
    }
  };

  const executeScheduledTransfer = async (centavos: number) => {
    if (!selectedAccount) return;

    try {
      const maxRuns =
        timing === 'recurring' && maxRunsStr ? parseInt(maxRunsStr, 10) : null;
      const { error: schedErr } = await supabase.rpc(
        'create_scheduled_transfer_to_number',
        {
          p_from_account: selectedAccount.account_id,
          p_to_account_number: recipientAccountNumber.trim(),
          p_amount: centavos,
          p_frequency: timing === 'recurring' ? frequency : 'once',
          p_start_date: scheduledDate,
          p_end_date: null,
          p_max_runs: maxRuns,
          p_note: reference.trim() || 'Scheduled Transfer',
        }
      );

      setLoading(false);

      if (schedErr) {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch {
          // Ignored
        }
        setErrorMessage(toUserMessage(schedErr.message, selectedAccount?.balance));
      } else {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          // Ignored
        }
        setIsScheduledSuccess(true);
        setStep('success');
      }
    } catch (err: any) {
      setLoading(false);
      setErrorMessage(toUserMessage(err?.message, selectedAccount?.balance));
    }
  };

  const executeServerTransfer = async (centavos: number) => {
    if (!selectedAccount) return;

    const { data, error } = await executeTransfer(supabase, {
      from_account: selectedAccount.account_id,
      to_account_number: recipientAccountNumber.trim(),
      amount: centavos,
      idempotency_key: idempotencyKey,
      reference: reference.trim() || 'Mobile Transfer',
    });

    setLoading(false);

    if (error) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {
        // Ignored
      }
      setErrorMessage(toUserMessage(error, selectedAccount?.balance));
    } else if (data) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // Ignored
      }

      if (shouldSaveRecipient && saveNickname.trim()) {
        try {
          await supabase.rpc('add_saved_recipient', {
            p_account_number: recipientAccountNumber.trim(),
            p_nickname: saveNickname.trim(),
          });
        } catch {
          // Non-blocking if save fails
        }
      }

      setSuccessResult(data);
      setStep('success');
      onTransferSuccess(data);
    }
  };

  const centavosAmount = phpToCentavos(amountStr);

  return (
    <BottomSheet
      visible={visible}
      onClose={resetState}
      dismissible={!loading}
      onRequestDismiss={handleRequestDismiss}
      title={
        step === 'recipient'
          ? 'Transfer · Recipient'
          : step === 'amount'
            ? 'Transfer · Amount'
            : step === 'review'
              ? 'Transfer · Review'
              : 'Transfer Successful'
      }
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {errorMessage ? (
          <Card variant="subtle" style={styles.errorCard}>
            <AlertCircle size={18} color={colors.redText} />
            <Text variant="caption" color={colors.redText} style={styles.errorText}>
              {errorMessage}
            </Text>
          </Card>
        ) : null}

        {/* STEP 1: RECIPIENT */}
        {step === 'recipient' && (
          <TransferRecipientStep
            recipientTab={recipientTab}
            onTabChange={setRecipientTab}
            savedRecipients={savedRecipients}
            otherAccounts={otherAccounts}
            selectedAccount={selectedAccount}
            recipientAccountNumber={recipientAccountNumber}
            onRecipientAccountChange={(val) => {
              setRecipientAccountNumber(val);
              setRecipientNickname('');
            }}
            shouldSaveRecipient={shouldSaveRecipient}
            onShouldSaveChange={setShouldSaveRecipient}
            saveNickname={saveNickname}
            onSaveNicknameChange={setSaveNickname}
            hideBalance={hideBalance}
            onSelectSaved={handleSelectSavedRecipient}
            onSelectOwn={handleSelectOwnAccount}
            onContinue={handleNextFromRecipient}
            onRequestMoneyPress={onRequestMoneyPress}
          />
        )}

        {/* STEP 2: AMOUNT */}
        {step === 'amount' && (
          <TransferAmountStep
            amountStr={amountStr}
            onAmountChange={setAmountStr}
            reference={reference}
            onReferenceChange={setReference}
            selectedAccount={selectedAccount}
            hideBalance={hideBalance}
            timing={timing}
            onTimingChange={setTiming}
            scheduledDate={scheduledDate}
            onScheduledDateChange={setScheduledDate}
            frequency={frequency}
            onFrequencyChange={setFrequency}
            maxRunsStr={maxRunsStr}
            onMaxRunsChange={setMaxRunsStr}
            onBack={() => setStep('recipient')}
            onReview={handleNextFromAmount}
          />
        )}

        {/* STEP 3: REVIEW */}
        {step === 'review' && (
          <TransferReviewStep
            centavosAmount={centavosAmount}
            selectedAccount={selectedAccount}
            recipientAccountNumber={recipientAccountNumber}
            recipientNickname={recipientNickname}
            reference={reference}
            timing={timing}
            scheduledDate={scheduledDate}
            frequency={frequency}
            maxRunsStr={maxRunsStr}
            hideBalance={hideBalance}
            loading={loading}
            onBack={() => setStep('amount')}
            onConfirm={handleConfirmTransfer}
          />
        )}

        {/* STEP 4: SUCCESS */}
        {step === 'success' && (
          <TransferSuccessStep
            successResult={successResult}
            isScheduledSuccess={isScheduledSuccess}
            timing={timing}
            scheduledDate={scheduledDate}
            frequency={frequency}
            centavosAmount={centavosAmount}
            recipientNickname={recipientNickname}
            recipientAccountNumber={recipientAccountNumber}
            selectedAccountBalance={selectedAccount?.balance || 0}
            hideBalance={hideBalance}
            onDone={resetState}
          />
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xl,
    gap: spacing.base,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tintRed,
    borderColor: colors.redText,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: {
    flex: 1,
  },
});
