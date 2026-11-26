import React, { useState, useEffect, useRef } from 'react';
import { useFeatureAccounts } from '../hooks/useFeatureAccounts';
import { useProtectiveFreeze } from '../hooks/useProtectiveFreeze';
import { useInFlightGuard } from '../hooks/useInFlightGuard';
import { AccountLoadStatus } from '../components/AccountLoadStatus';
import { FrozenMoneyGate } from '../components/FrozenMoneyGate';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AlertCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  colors,
  spacing,
  radius,
  formatCentavosToPHP,
  phpToCentavos,
  generateIdempotencyKey,
  executeWithdraw,
  toUserMessage,
  type MoneyOperationResult,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { resultRows } from '../utils/resultReceipt';
import { useSettings } from '../context/SettingsContext';
import { useTotpPrompt } from '../context/PasswordPromptContext';
import { retryStepUp } from '../utils/stepUpRetry';
import { StepUpSetupLink } from '../components/StepUpSetupLink';
import {
  FeatureScreen,
  Text,
  AmountInput,
  TextField,
  Button,
  Card,
  ResultView,
  ReviewCard,
  AccountStep,
  RecipientChip,
  formatAccountLabel,
} from '../components';
import { commitButtonLabel } from '../utils/moneyFlow';

export function CashOutScreen() {
  const navigation = useNavigation<any>();
  const promptTotp = useTotpPrompt();
  const { hideBalance, confirmBiometricPayment } = useSettings();

  const freeze = useProtectiveFreeze();
  const { accounts, accountsLoading, accountError, loadAccounts } = useFeatureAccounts(
    !freeze.loading && !freeze.protective
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [amountStr, setAmountStr] = useState('');
  const [reference, setReference] = useState('');
  const [step, setStep] = useState<'source' | 'input' | 'review' | 'success'>('input');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<MoneyOperationResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    generateIdempotencyKey('withdraw')
  );

  // Spec 7B.4: with 2+ accounts the account picker comes first. Decided once,
  // when the accounts first arrive, so a later reload never jumps steps.
  // Step content renders only after the decision, so the wrong step never flashes.
  const firstStepPendingRef = useRef(true);
  const [firstStepDecided, setFirstStepDecided] = useState(false);
  useEffect(() => {
    if (firstStepPendingRef.current && !accountsLoading && accounts.length > 0) {
      firstStepPendingRef.current = false;
      if (accounts.length >= 2) setStep('source');
      setFirstStepDecided(true);
    }
  }, [accountsLoading, accounts.length]);
  const guardMoneyAction = useInFlightGuard();

  const selectedAccount =
    accounts.find((a) => a.account_id === selectedAccountId) || accounts[0];

  useEffect(() => {
    setIdempotencyKey(generateIdempotencyKey('withdraw'));
  }, [amountStr, reference, selectedAccountId]);

  const hasInput = Boolean(amountStr) && step !== 'success';

  const handleProceedToReview = () => {
    setErrorMessage(null);
    const centavos = phpToCentavos(amountStr);

    if (!selectedAccount) {
      setErrorMessage('Please select a source account.');
      return;
    }
    if (centavos <= 0) {
      setErrorMessage('Amount must be greater than ₱0.00');
      return;
    }
    if (centavos > selectedAccount.balance) {
      setErrorMessage(
        `Insufficient funds. Available: ${hideBalance ? '₱••••••' : formatCentavosToPHP(selectedAccount.balance)}`
      );
      return;
    }

    if (!idempotencyKey) {
      setIdempotencyKey(generateIdempotencyKey('withdraw'));
    }
    setStep('review');
  };

  const handleConfirmWithdraw = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    setErrorMessage(null);

    const centavos = phpToCentavos(amountStr);

    // 1. Biometric / Password confirmation
    const bioResult = await confirmBiometricPayment({
      title: 'Authorize cash out',
      message: `Confirm cash-out of ${formatCentavosToPHP(centavos)} from account •• ${selectedAccount.account_number.slice(-4)}`,
    });

    if (!bioResult.success) {
      setLoading(false);
      if (bioResult.cancelled) {
        setErrorMessage('Not authorized. Nothing was sent.');
      } else {
        setErrorMessage(bioResult.error || 'Authorization failed.');
      }
      return;
    }

    await executeServerWithdraw(centavos);
  };

  const executeServerWithdraw = async (centavos: number) => {
    if (!selectedAccount) return;

    const { data, error } = await retryStepUp(
      () =>
        executeWithdraw(supabase, {
          account: selectedAccount.account_id,
          amount: centavos,
          idempotency_key: idempotencyKey,
          reference: reference.trim() || 'ATM Withdrawal',
        }),
      promptTotp
    );

    setLoading(false);

    if (error) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {
        // Ignored
      }
      setErrorMessage(toUserMessage(error, selectedAccount.balance));
    } else if (data) {
      setSuccessResult(data);
      setStep('success');
    }
  };

  const centavosAmount = phpToCentavos(amountStr);

  const hasMultipleAccounts = accounts.length >= 2;
  const accountsReady =
    firstStepDecided && !accountsLoading && !accountError && accounts.length > 0;
  const inputSteps = hasMultipleAccounts
    ? (['source', 'input', 'review'] as const)
    : (['input', 'review'] as const);
  const stepIndex = (inputSteps as readonly string[]).indexOf(step);

  if (freeze.protective) {
    return (
      <FeatureScreen title="Cash out">
        <FrozenMoneyGate
          freeze={freeze}
          onConfirm={() => navigation.navigate('BantaySecurity')}
        />
      </FeatureScreen>
    );
  }

  return (
    <FeatureScreen
      title="Cash out"
      step={stepIndex >= 0 ? stepIndex + 1 : undefined}
      stepCount={step === 'success' ? undefined : inputSteps.length}
      onPrevStep={() => {
        setErrorMessage(null);
        setStep(inputSteps[Math.max(stepIndex - 1, 0)]);
      }}
      isDirty={hasInput}
      isProcessing={loading}
      footer={
        !accountsReady ? null : step === 'input' ? (
          <Button
            title="Continue"
            onPress={handleProceedToReview}
            style={styles.actionButton}
          />
        ) : step === 'review' ? (
          <View style={styles.footerRow}>
            <Button
              title={commitButtonLabel('cashOut', centavosAmount, loading)}
              onPress={() => void guardMoneyAction(handleConfirmWithdraw)}
              loading={loading}
              style={styles.actionButton}
            />
          </View>
        ) : null
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

      {errorMessage && step !== 'input' && step !== 'success' ? (
        <Card variant="subtle" style={styles.errorCard}>
          <AlertCircle size={18} color={colors.redText} />
          <Text variant="caption" color={colors.redText} style={styles.errorText}>
            {errorMessage}
          </Text>
        </Card>
      ) : null}

      {accountsReady && step === 'source' && (
        <AccountStep
          heading="Cash out from"
          accounts={accounts}
          selectedAccountId={selectedAccount?.account_id ?? null}
          hideBalance={hideBalance}
          onSelect={(accountId) => {
            setSelectedAccountId(accountId);
            setErrorMessage(null);
            setStep('input');
          }}
        />
      )}

      {accountsReady && step === 'input' && (
        <View style={styles.stepContainer}>
          {selectedAccount ? (
            <RecipientChip label={`From ${formatAccountLabel(selectedAccount)}`} />
          ) : null}
          <AmountInput
            label="Amount"
            value={amountStr}
            onChangeText={setAmountStr}
            presetAmounts={[500, 1000, 2000, 5000]}
            helperText={`Available: ${hideBalance ? '₱••••••' : formatCentavosToPHP(selectedAccount?.balance || 0)}`}
            error={errorMessage || undefined}
          />

          <TextField
            label="Note (optional)"
            value={reference}
            onChangeText={setReference}
            placeholder="e.g. Rent"
          />
        </View>
      )}

      {accountsReady && step === 'review' && (
        <ReviewCard
          eyebrow="You're cashing out"
          amountCentavos={centavosAmount}
          rows={[
            {
              label: 'From',
              value: selectedAccount ? formatAccountLabel(selectedAccount) : '',
            },
            { label: 'Note', value: reference.trim() },
            {
              label: 'Balance after',
              value: hideBalance
                ? '₱••••••'
                : formatCentavosToPHP((selectedAccount?.balance || 0) - centavosAmount),
              valueAccessibilityLabel: hideBalance ? 'Amount hidden' : undefined,
            },
            { label: 'Fee', value: 'Free' },
          ]}
        />
      )}

      {step === 'success' && successResult && (
        <ResultView
          outcome="completed"
          title="Cash-out complete"
          amountCentavos={successResult.amount}
          hideBalance={hideBalance}
          details={resultRows(successResult, 'From')}
          shareReceipt
          contextualActionTitle="Cash out again"
          onContextualAction={() => navigation.replace('CashOut')}
          onDone={() => navigation.goBack()}
        />
      )}

      <StepUpSetupLink error={errorMessage} onClose={() => navigation.goBack()} />
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  stepContainer: {
    gap: spacing.base,
  },
  actionButton: {
    width: '100%',
  },
  footerRow: {
    width: '100%',
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
