import React, { useState, useEffect, useRef } from 'react';
import { useFeatureAccounts } from '../hooks/useFeatureAccounts';
import { useInFlightGuard } from '../hooks/useInFlightGuard';
import { AccountLoadStatus } from '../components/AccountLoadStatus';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { AlertCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  colors,
  spacing,
  radius,
  formatCentavosToPHP,
  phpToCentavos,
  generateIdempotencyKey,
  executeDeposit,
  toUserMessage,
  formatReferenceId,
  type MoneyOperationResult,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';
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

export function AddMoneyScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { hideBalance } = useSettings();

  const { accounts, accountsLoading, accountError, loadAccounts } = useFeatureAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [amountStr, setAmountStr] = useState('');
  const [reference, setReference] = useState('');
  const [step, setStep] = useState<'source' | 'input' | 'review' | 'success'>('input');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<MoneyOperationResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    generateIdempotencyKey('deposit')
  );

  // Spec 7B.4: with 2+ accounts the account picker comes first. Decided once,
  // when the accounts first arrive, so a later reload never jumps steps.
  const firstStepPendingRef = useRef(true);
  useEffect(() => {
    if (firstStepPendingRef.current && !accountsLoading && accounts.length > 0) {
      firstStepPendingRef.current = false;
      if (accounts.length >= 2) setStep('source');
    }
  }, [accountsLoading, accounts.length]);
  const guardMoneyAction = useInFlightGuard();

  const selectedAccount =
    accounts.find((a) => a.account_id === selectedAccountId) || accounts[0];

  useEffect(() => {
    setIdempotencyKey(generateIdempotencyKey('deposit'));
  }, [amountStr, reference, selectedAccountId]);

  const hasInput = Boolean(amountStr) && step !== 'success';

  const handleProceedToReview = () => {
    setErrorMessage(null);
    const centavos = phpToCentavos(amountStr);

    if (!selectedAccount) {
      setErrorMessage('Please select a destination account.');
      return;
    }
    if (centavos <= 0) {
      setErrorMessage('Amount must be greater than ₱0.00');
      return;
    }

    if (!idempotencyKey) {
      setIdempotencyKey(generateIdempotencyKey('deposit'));
    }
    setStep('review');
  };

  const handleConfirmDeposit = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    setErrorMessage(null);

    const centavos = phpToCentavos(amountStr);

    const { data, error } = await executeDeposit(supabase, {
      account: selectedAccount.account_id,
      amount: centavos,
      idempotency_key: idempotencyKey,
      reference: reference.trim() || 'Online Cash-in',
    });

    setLoading(false);

    if (error) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {
        // Haptics optional
      }
      setErrorMessage(toUserMessage(error, selectedAccount.balance));
    } else if (data) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // Haptics optional
      }
      setSuccessResult(data);
      setStep('success');
    }
  };

  const centavosAmount = phpToCentavos(amountStr);

  const hasMultipleAccounts = accounts.length >= 2;
  const accountsReady = !accountsLoading && !accountError && accounts.length > 0;
  const inputSteps = hasMultipleAccounts
    ? (['source', 'input', 'review'] as const)
    : (['input', 'review'] as const);
  const stepIndex = (inputSteps as readonly string[]).indexOf(step);

  return (
    <FeatureScreen
      title="Add money"
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
              title={commitButtonLabel('add', centavosAmount, loading)}
              onPress={() => void guardMoneyAction(handleConfirmDeposit)}
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
          heading="Add to"
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
            <RecipientChip label={`To ${formatAccountLabel(selectedAccount)}`} />
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
          eyebrow="You're adding"
          amountCentavos={centavosAmount}
          rows={[
            {
              label: 'To',
              value: selectedAccount ? formatAccountLabel(selectedAccount) : '',
            },
            { label: 'Note', value: reference.trim() },
            {
              label: 'Balance after',
              value: hideBalance
                ? '₱••••••'
                : formatCentavosToPHP((selectedAccount?.balance || 0) + centavosAmount),
              valueAccessibilityLabel: hideBalance ? 'Amount hidden' : undefined,
            },
            { label: 'Fee', value: 'Free' },
          ]}
        />
      )}

      {step === 'success' && successResult && (
        <ResultView
          outcome="completed"
          title={successResult.idempotent_replay ? 'Already processed' : 'Money added'}
          amountCentavos={successResult.amount || centavosAmount}
          details={[
            {
              label: 'To account',
              value: selectedAccount?.account_number || '••••',
            },
            {
              label: 'Balance now',
              value: hideBalance
                ? '₱••••••'
                : formatCentavosToPHP(
                    successResult.from_new_balance !== undefined
                      ? successResult.from_new_balance
                      : successResult.new_balance !== undefined
                        ? successResult.new_balance
                        : (selectedAccount?.balance || 0) + centavosAmount
                  ),
            },
            ...(successResult.created_at
              ? [
                  {
                    label: 'Date & time',
                    value: new Date(successResult.created_at).toLocaleString(),
                  },
                ]
              : []),
            {
              label: 'Reference no.',
              value: formatReferenceId(successResult.id),
            },
          ]}
          onDone={() => navigation.goBack()}
        />
      )}
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
