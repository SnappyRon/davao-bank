import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MinusCircle, AlertCircle } from 'lucide-react-native';
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
  fetchAccountBalances,
  formatReferenceId,
  type AccountBalance,
  type MoneyOperationResult,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
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
  AmountText,
  ResultView,
} from '../components';

export function CashOutScreen() {
  const navigation = useNavigation<any>();
  const promptTotp = useTotpPrompt();
  const { hideBalance, confirmBiometricPayment } = useSettings();

  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [amountStr, setAmountStr] = useState('');
  const [reference, setReference] = useState('');
  const [step, setStep] = useState<'input' | 'review' | 'success'>('input');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<MoneyOperationResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    generateIdempotencyKey('withdraw')
  );

  useEffect(() => {
    fetchAccountBalances(supabase).then(({ data }) => {
      if (data && data.length > 0) {
        setAccounts(data);
        if (!selectedAccountId) {
          setSelectedAccountId(data[0].account_id);
        }
      }
    });
  }, []);

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
      title: 'Authorize Cash-Out',
      message: `Confirm cash-out of ${formatCentavosToPHP(centavos)} from account ${selectedAccount.account_number}`,
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
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // Ignored
      }
      setSuccessResult(data);
      setStep('success');
    }
  };

  const centavosAmount = phpToCentavos(amountStr);

  return (
    <FeatureScreen
      title={
        step === 'input' ? 'Cash out' : step === 'review' ? 'Review cash out' : 'Cash out'
      }
      step={step === 'input' ? 1 : step === 'review' ? 2 : undefined}
      stepCount={step === 'success' ? undefined : 2}
      onPrevStep={() => setStep('input')}
      isDirty={hasInput}
      isProcessing={loading}
      footer={
        step === 'input' ? (
          <Button
            title="Continue"
            onPress={handleProceedToReview}
            style={styles.actionButton}
          />
        ) : step === 'review' ? (
          <View style={styles.footerRow}>
            <Button
              title={`Cash out ${formatCentavosToPHP(centavosAmount)}`}
              onPress={handleConfirmWithdraw}
              loading={loading}
              icon={<MinusCircle size={18} color={colors.textInverse} />}
              style={styles.actionButton}
            />
          </View>
        ) : null
      }
    >
      {errorMessage ? (
        <Card variant="subtle" style={styles.errorCard}>
          <AlertCircle size={18} color={colors.redText} />
          <Text variant="caption" color={colors.redText} style={styles.errorText}>
            {errorMessage}
          </Text>
        </Card>
      ) : null}

      {step === 'input' && (
        <View style={styles.stepContainer}>
          <AmountInput
            label="Amount"
            value={amountStr}
            onChangeText={setAmountStr}
            presetAmounts={[500, 1000, 2000, 5000]}
            helperText={`Available: ${hideBalance ? '₱••••••' : formatCentavosToPHP(selectedAccount?.balance || 0)}`}
          />

          <TextField
            label="Note (optional)"
            value={reference}
            onChangeText={setReference}
            placeholder="e.g. Rent"
          />
        </View>
      )}

      {step === 'review' && (
        <View style={styles.stepContainer}>
          <Card variant="subtle" style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <Text variant="caption" color={colors.textMuted}>
                You're cashing out
              </Text>
              <AmountText
                amountCentavos={centavosAmount}
                direction="outgoing"
                variant="display"
                showSign={false}
              />
            </View>

            <View style={styles.reviewRow}>
              <Text variant="body" color={colors.textSecondary}>
                From account
              </Text>
              <Text variant="bodyStrong" tabularNums color={colors.ink}>
                {selectedAccount?.account_number}
              </Text>
            </View>

            <View style={styles.reviewRow}>
              <Text variant="body" color={colors.textSecondary}>
                Balance after
              </Text>
              <AmountText
                amountCentavos={(selectedAccount?.balance || 0) - centavosAmount}
                hidden={hideBalance}
                variant="bodyStrong"
                color={colors.ink}
                showSign={false}
              />
            </View>

            <View style={styles.reviewRow}>
              <Text variant="body" color={colors.textSecondary}>
                Fee
              </Text>
              <Text variant="bodyStrong" color={colors.ink}>
                Free
              </Text>
            </View>

            <Text variant="caption" color={colors.textMuted} align="center">
              Simulated money — no real funds move.
            </Text>
          </Card>
        </View>
      )}

      {step === 'success' && successResult && (
        <ResultView
          outcome="completed"
          title={
            successResult.idempotent_replay ? 'Already processed' : 'Cash-out complete'
          }
          amountCentavos={successResult.amount || centavosAmount}
          details={[
            {
              label: 'From account',
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
                        : selectedAccount?.balance || 0
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
  reviewCard: {
    padding: spacing.lg,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  reviewHeader: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
