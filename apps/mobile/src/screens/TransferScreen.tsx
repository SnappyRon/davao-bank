import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { useFeatureAccounts } from '../hooks/useFeatureAccounts';
import { AccountLoadStatus } from '../components/AccountLoadStatus';
import { StepUpSetupLink } from '../components/StepUpSetupLink';
import { retryStepUp } from '../utils/stepUpRetry';
import { useTotpPrompt } from '../context/PasswordPromptContext';
import { recoverTransfer, isUncertainTransferError } from '../utils/transferRecovery';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
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
  MAX_QR_AMOUNT_CENTAVOS,
  MAX_QR_NOTE_LENGTH,
  toUserMessage,
  type AccountBalance,
  type MoneyOperationResult,
  type SavedRecipient,
  type ScheduledPaymentFrequency,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { isConfirmedRejection, type ResultResponse } from '../utils/resultReceipt';
import { ResultView } from '../components/ResultView';
import { useSettings } from '../context/SettingsContext';
import {
  FeatureScreen,
  Text,
  Card,
  Button,
  AccountStep,
  AccountPickerSheet,
  formatAccountLabel,
  useToast,
} from '../components';
import { commitButtonLabel } from '../utils/moneyFlow';
import { useInFlightGuard } from '../hooks/useInFlightGuard';
import {
  TransferRecipientStep,
  type RecipientTab,
} from './transfer/TransferRecipientStep';
import { TransferAmountStep, type TransferTiming } from './transfer/TransferAmountStep';
import { TransferReviewStep } from './transfer/TransferReviewStep';
import { TransferSuccessStep } from './transfer/TransferSuccessStep';

type TransferStep = 'source' | 'recipient' | 'amount' | 'review' | 'success';

// Never add Transfer to a React Navigation linking config: the davaobank app scheme matches QR payloads.
export function TransferScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const toast = useToast();
  const onClose = () => navigation.goBack();
  const { accounts, accountsLoading, accountError, loadAccounts } = useFeatureAccounts();
  const route = useRoute<RouteProp<RootStackParamList, 'Transfer'>>();
  const {
    recipientAccount: initialRecipientAccount,
    amountCentavos: initialAmountCentavos,
    note: initialNote,
    recipientNickname: initialRecipientNickname,
  } = route.params ?? {};
  const onRequestMoneyPress = () =>
    navigation.replace('QRHub', { initialTab: 'request' });

  const promptTotp = useTotpPrompt();
  const { hideBalance, confirmBiometricPayment } = useSettings();

  const [step, setStep] = useState<TransferStep>('recipient');
  const [recipientTab, setRecipientTab] = useState<RecipientTab>('saved');
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
  const [scheduledError, setScheduledError] = useState<unknown>(null);
  const [scheduledResult, setScheduledResult] = useState<ResultResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<MoneyOperationResult | null>(null);
  const [resultBalanceLoaded, setResultBalanceLoaded] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  // Source account: chosen in the first step when the user has 2+ accounts.
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const hasMultipleAccounts = accounts.length >= 2;
  const selectedAccount =
    accounts.find((a) => a.account_id === selectedAccountId) ?? accounts[0];

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

  const prefillAppliedRef = useRef(false);
  // Step content renders only after the first step is chosen, so the wrong step never flashes.
  const [firstStepDecided, setFirstStepDecided] = useState(false);
  // With 2+ accounts a prefilled transfer starts on the source step, then
  // continues to the step the prefill chose (amount or review).
  const afterSourceStepRef = useRef<TransferStep>('recipient');
  const guardMoneyAction = useInFlightGuard();

  // §0.9 Item 5: Regenerate idempotency key whenever payload changes (only before success)
  useEffect(() => {
    if (step !== 'success') {
      setIdempotencyKey(generateIdempotencyKey('transfer'));
    }
  }, [amountStr, recipientAccountNumber, reference, selectedAccount?.account_id, step]);

  useEffect(() => {
    // Apply route prefill once, after the source account is known.
    if (
      !prefillAppliedRef.current &&
      !accountsLoading &&
      !accountError &&
      accounts.length > 0
    ) {
      prefillAppliedRef.current = true;
      setFirstStepDecided(true);
      loadSavedRecipients();
      if (initialRecipientAccount) {
        const cleaned = initialRecipientAccount.trim();
        setRecipientAccountNumber(cleaned);
        const nickname =
          typeof initialRecipientNickname === 'string'
            ? initialRecipientNickname.trim()
            : '';
        // Valid recipient: keep the nickname and start on the source step (2+ accounts).
        const startStep = (next: TransferStep) => {
          if (nickname && nickname.length <= 40) setRecipientNickname(nickname);
          afterSourceStepRef.current = next;
          setStep(accounts.length >= 2 ? 'source' : next);
        };
        // With 2+ accounts the source is not chosen yet: handleSelectSource runs
        // the same-account check once it is.
        const currentSource = accounts.length >= 2 ? undefined : selectedAccount;
        // §0.9 Item 3: recipient checks on QR prefill (10 digits, not same account)
        if (cleaned.length !== 10 || !/^\d{10}$/.test(cleaned)) {
          setErrorMessage('Invalid QR recipient account: must be exactly 10 digits.');
          setStep('recipient');
        } else if (currentSource && cleaned === currentSource.account_number) {
          setErrorMessage('Cannot transfer to the same account');
          setStep('recipient');
        } else if (
          typeof initialAmountCentavos === 'number' &&
          Number.isInteger(initialAmountCentavos) &&
          initialAmountCentavos > 0 &&
          initialAmountCentavos <= MAX_QR_AMOUNT_CENTAVOS &&
          (initialNote === undefined ||
            (typeof initialNote === 'string' && initialNote.length <= MAX_QR_NOTE_LENGTH))
        ) {
          setAmountStr((initialAmountCentavos / 100).toFixed(2));
          if (initialNote) setReference(initialNote);
          // §0.9 Item 3: Generate idempotency key on QR prefill path too
          setIdempotencyKey(generateIdempotencyKey('transfer'));
          startStep('review');
        } else {
          startStep('amount');
        }
      } else {
        // §0.9 Item 1: Every money modal resets to step 1 whenever visible becomes true
        // (spec 7B.4: with 2+ accounts the source account picker comes first).
        setStep(accounts.length >= 2 ? 'source' : 'recipient');
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
  }, [
    accountsLoading,
    accountError,
    accounts,
    initialRecipientAccount,
    initialAmountCentavos,
    initialNote,
    initialRecipientNickname,
    selectedAccount,
    loadSavedRecipients,
  ]);

  const resetState = onClose;

  // §0.9 Item 2: Confirmation before discarding flow with input on any step
  const hasInput =
    Boolean(recipientAccountNumber || amountStr || reference) &&
    step !== 'success' &&
    !uncertain;

  const handleSelectOwnAccount = (acc: AccountBalance) => {
    setRecipientAccountNumber(acc.account_number);
    setRecipientNickname(formatAccountLabel(acc));
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
      const { data: scheduledData, error: schedErr } = await retryStepUp(
        () =>
          supabase.rpc('create_scheduled_transfer_to_number', {
            p_from_account: selectedAccount.account_id,
            p_to_account_number: recipientAccountNumber.trim(),
            p_amount: centavos,
            p_frequency: timing === 'recurring' ? frequency : 'once',
            p_start_date: scheduledDate,
            p_end_date: null,
            p_max_runs: maxRuns,
            p_note: reference.trim() || 'Scheduled Transfer',
          }),
        promptTotp
      );

      setLoading(false);

      if (schedErr) {
        setScheduledError(schedErr);
        setErrorMessage(toUserMessage(schedErr.message, selectedAccount?.balance));
      } else {
        setScheduledResult(scheduledData);
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

    const params = {
      from_account: selectedAccount.account_id,
      to_account_number: recipientAccountNumber.trim(),
      amount: centavos,
      idempotency_key: idempotencyKey,
      reference: reference.trim() || 'Mobile Transfer',
    };
    const { data, error } = await retryStepUp(
      () =>
        recoverTransfer(
          () => executeTransfer(supabase, params),
          () => setErrorMessage('Checking status…')
        ),
      promptTotp
    );
    setUncertain(isUncertainTransferError(error));

    setLoading(false);

    if (error) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {
        // Ignored
      }
      setErrorMessage(
        isUncertainTransferError(error)
          ? 'Status is not confirmed. Reconnect and authorize again to check the same transfer. Do not start a new transfer.'
          : toUserMessage(error, selectedAccount?.balance)
      );
    } else if (data) {
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

      setErrorMessage(null);
      setSuccessResult(data);
      setStep('success');
    }
  };

  useEffect(() => {
    if (step === 'success' && successResult) {
      setResultBalanceLoaded(false);
      let active = true;
      void loadAccounts().then(() => {
        if (active) setResultBalanceLoaded(true);
      });
      return () => {
        active = false;
      };
    }
  }, [step, successResult, loadAccounts]);

  const centavosAmount = phpToCentavos(amountStr);

  // Spec 7B.4: Input → Review → Authorize → Processing → Result, on one page.
  const inputSteps: TransferStep[] = hasMultipleAccounts
    ? ['source', 'recipient', 'amount', 'review']
    : ['recipient', 'amount', 'review'];
  const stepIndex = inputSteps.indexOf(step);

  const handleSelectSource = (accountId: string) => {
    setAccountPickerOpen(false);
    setSelectedAccountId(accountId);
    setErrorMessage(null);
    const account = accounts.find((a) => a.account_id === accountId);
    if (!account) return;
    const next = step === 'source' ? afterSourceStepRef.current : step;
    afterSourceStepRef.current = 'recipient';
    if (next === 'recipient') {
      setStep('recipient');
      return;
    }
    // Moving past the recipient (prefill) or changed on Review: re-check the
    // rules the earlier steps enforce.
    if (recipientAccountNumber.trim() === account.account_number) {
      setErrorMessage('Cannot transfer to the same account');
      setStep('recipient');
    } else if (next === 'review' && centavosAmount > account.balance) {
      setErrorMessage('Insufficient funds in selected source account');
      setStep('amount');
    } else {
      setStep(next);
    }
  };

  const commitAction = timing === 'now' ? 'send' : 'schedule';

  const footer = uncertain ? (
    <View style={styles.uncertainActions}>
      <Button
        title="Check status"
        loading={loading}
        onPress={() =>
          void guardMoneyAction(async () => {
            setLoading(true);
            await executeServerTransfer(centavosAmount);
          })
        }
      />
      <Button
        title="Done"
        variant="secondary"
        disabled={loading}
        onPress={() => {
          toast.show('Check Activity to confirm your transfer status', 'info');
          navigation.goBack();
        }}
      />
    </View>
  ) : step === 'amount' ? (
    <Button title="Continue" onPress={handleNextFromAmount} />
  ) : step === 'review' ? (
    <Button
      title={commitButtonLabel(commitAction, centavosAmount, loading)}
      onPress={() => void guardMoneyAction(handleConfirmTransfer)}
      loading={loading}
    />
  ) : undefined;

  const accountsReady =
    firstStepDecided && !accountsLoading && !accountError && accounts.length > 0;

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
      title="Send money"
      footer={
        step !== 'success' && accountsReady && !isConfirmedRejection(scheduledError)
          ? footer
          : undefined
      }
    >
      {step !== 'success' && (
        <AccountLoadStatus
          loading={accountsLoading}
          empty={accounts.length === 0}
          error={accountError}
          onRetry={loadAccounts}
        />
      )}
      {isConfirmedRejection(scheduledError) ? (
        <ResultView
          outcome="failed"
          title="Not sent"
          onDone={() => setScheduledError(null)}
        />
      ) : (
        (step === 'success' || accountsReady) && (
          <View style={styles.container}>
            {errorMessage &&
            step !== 'amount' &&
            !(step === 'recipient' && recipientTab === 'new') ? (
              <Card variant="subtle" style={styles.errorCard}>
                <AlertCircle size={18} color={colors.redText} />
                <Text variant="caption" color={colors.redText} style={styles.errorText}>
                  {errorMessage}
                </Text>
              </Card>
            ) : null}

            {/* STEP 0 (2+ accounts): SOURCE ACCOUNT */}
            {step === 'source' && (
              <AccountStep
                heading="Send from"
                accounts={accounts}
                selectedAccountId={selectedAccount?.account_id ?? null}
                hideBalance={hideBalance}
                onSelect={handleSelectSource}
              />
            )}

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
                  if (errorMessage) setErrorMessage(null);
                }}
                recipientError={errorMessage}
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
                recipientAccountNumber={recipientAccountNumber}
                recipientNickname={recipientNickname}
                amountStr={amountStr}
                onAmountChange={setAmountStr}
                amountError={errorMessage}
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
                onChangeSource={
                  hasMultipleAccounts && !loading && !uncertain
                    ? () => setAccountPickerOpen(true)
                    : undefined
                }
              />
            )}

            {/* STEP 4: SUCCESS */}
            {step === 'success' && (
              <TransferSuccessStep
                successResult={successResult}
                isScheduledSuccess={isScheduledSuccess}
                scheduledResult={scheduledResult}
                timing={timing}
                scheduledDate={scheduledDate}
                frequency={frequency}
                centavosAmount={centavosAmount}
                recipientNickname={recipientNickname}
                recipientAccountNumber={recipientAccountNumber}
                selectedAccountBalance={
                  resultBalanceLoaded && !accountsLoading && !accountError
                    ? (accounts.find((a) => a.account_id === selectedAccountId)
                        ?.balance ??
                      (selectedAccountId ? undefined : accounts[0]?.balance))
                    : undefined
                }
                hideBalance={hideBalance}
                onDone={resetState}
                onSendAgain={() => navigation.replace('Transfer')}
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
        title="Send from"
      />
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xl,
    gap: spacing.base,
  },
  uncertainActions: {
    gap: spacing.sm,
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
