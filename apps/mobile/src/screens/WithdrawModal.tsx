import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { MinusCircle, CheckCircle2, AlertCircle } from 'lucide-react-native';
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
  type AccountBalance,
  type MoneyOperationResult,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';
import {
  BottomSheet,
  Text,
  AmountInput,
  TextField,
  Button,
  Card,
  AmountText,
} from '../components';

interface WithdrawModalProps {
  visible: boolean;
  onClose: () => void;
  accounts: AccountBalance[];
  onWithdrawSuccess: (result: MoneyOperationResult) => void;
}

export function WithdrawModal({
  visible,
  onClose,
  accounts,
  onWithdrawSuccess,
}: WithdrawModalProps) {
  const { hideBalance, confirmBiometricPayment } = useSettings();

  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    accounts[0]?.account_id || ''
  );
  const [amountStr, setAmountStr] = useState('');
  const [reference, setReference] = useState('ATM Withdrawal');
  const [step, setStep] = useState<'input' | 'review' | 'success'>('input');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<MoneyOperationResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const selectedAccount =
    accounts.find((a) => a.account_id === selectedAccountId) || accounts[0];

  useEffect(() => {
    if (visible) {
      setStep('input');
      setAmountStr('');
      setReference('ATM Withdrawal');
      setErrorMessage(null);
      setSuccessResult(null);
      setIdempotencyKey(generateIdempotencyKey('withdraw'));
    }
  }, [visible]);

  useEffect(() => {
    setIdempotencyKey(generateIdempotencyKey('withdraw'));
  }, [amountStr, reference, selectedAccountId]);

  const resetState = () => {
    setStep('input');
    setAmountStr('');
    setReference('ATM Withdrawal');
    setErrorMessage(null);
    setSuccessResult(null);
    setIdempotencyKey('');
    onClose();
  };

  const hasInput = Boolean(amountStr) && step !== 'success';

  const handleRequestDismiss = () => {
    if (loading) return;

    if (step === 'success') {
      resetState();
      return;
    }

    if (hasInput) {
      Alert.alert('Discard this cash-out?', 'Your details will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: resetState },
      ]);
    } else {
      resetState();
    }
  };

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

    // 1. Biometric / Password confirmation (§B.4, Fix 6)
    const bioResult = await confirmBiometricPayment({
      title: 'Authorize Cash-Out',
      message: `Confirm cash-out of ${formatCentavosToPHP(centavos)} from account ${selectedAccount.account_number}`,
    });

    if (!bioResult.success) {
      setLoading(false);
      if (bioResult.cancelled) {
        setErrorMessage(
          'Cash-out authorization was cancelled. You can retry whenever ready.'
        );
      } else {
        setErrorMessage(bioResult.error || 'Authorization failed.');
      }
      return;
    }

    await executeServerWithdraw(centavos);
  };

  const executeServerWithdraw = async (centavos: number) => {
    if (!selectedAccount) return;

    const { data, error } = await executeWithdraw(supabase, {
      account: selectedAccount.account_id,
      amount: centavos,
      idempotency_key: idempotencyKey,
      reference: reference.trim() || 'ATM Withdrawal',
    });

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
      onWithdrawSuccess(data);
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
        step === 'input'
          ? 'Cash-out · Withdraw'
          : step === 'review'
            ? 'Cash-out · Review'
            : 'Cash-out Successful'
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

        {step === 'input' && (
          <View style={styles.stepContainer}>
            <AmountInput
              label="Withdrawal Amount"
              value={amountStr}
              onChangeText={setAmountStr}
              presetAmounts={[500, 1000, 2000, 5000]}
              helperText={`Available: ${hideBalance ? '₱••••••' : formatCentavosToPHP(selectedAccount?.balance || 0)}`}
            />

            <TextField
              label="Reference / Purpose"
              value={reference}
              onChangeText={setReference}
              placeholder="e.g. ATM Withdrawal"
            />

            <Button
              title="Continue to Review"
              onPress={handleProceedToReview}
              style={styles.actionButton}
            />
          </View>
        )}

        {step === 'review' && (
          <View style={styles.stepContainer}>
            <Card variant="subtle" style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <Text variant="caption" color={colors.textMuted}>
                  TOTAL TO WITHDRAW
                </Text>
                <AmountText
                  amountCentavos={centavosAmount}
                  direction="outgoing"
                  variant="display"
                />
              </View>

              <View style={styles.reviewRow}>
                <Text variant="body" color={colors.textSecondary}>
                  From Account
                </Text>
                <Text variant="bodyStrong" tabularNums color={colors.ink}>
                  {selectedAccount?.account_number}
                </Text>
              </View>

              <View style={styles.reviewRow}>
                <Text variant="body" color={colors.textSecondary}>
                  New Balance
                </Text>
                <AmountText
                  amountCentavos={(selectedAccount?.balance || 0) - centavosAmount}
                  hidden={hideBalance}
                  variant="bodyStrong"
                  color={colors.ink}
                  showSign={false}
                />
              </View>
            </Card>

            <View style={styles.navRow}>
              <Button
                title="Back"
                variant="ghost"
                onPress={() => setStep('input')}
                disabled={loading}
                style={styles.backButton}
              />
              <Button
                title="Authorize Cash-out"
                onPress={handleConfirmWithdraw}
                loading={loading}
                icon={<MinusCircle size={18} color={colors.textInverse} />}
                style={styles.forwardButton}
              />
            </View>
          </View>
        )}

        {step === 'success' && successResult && (
          <View style={styles.stepContainer}>
            <View style={styles.successIconBox}>
              <CheckCircle2 size={54} color={colors.primary} />
              <Text variant="h2" align="center" style={styles.successTitle}>
                {successResult.idempotent_replay
                  ? 'Already Processed'
                  : 'Cash-out Prepared'}
              </Text>
              {successResult.idempotent_replay && (
                <Text variant="caption" color={colors.textSecondary} align="center">
                  This payment was already processed.
                </Text>
              )}
              <AmountText
                amountCentavos={successResult.amount || centavosAmount}
                direction="outgoing"
                variant="display"
              />
            </View>

            <Card variant="subtle" style={styles.receiptCard}>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textMuted}>
                  Account
                </Text>
                <Text variant="bodyStrong" tabularNums color={colors.ink}>
                  {selectedAccount?.account_number}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textMuted}>
                  Updated Balance
                </Text>
                <AmountText
                  amountCentavos={
                    successResult.from_new_balance !== undefined
                      ? successResult.from_new_balance
                      : successResult.new_balance !== undefined
                        ? successResult.new_balance
                        : selectedAccount?.balance || 0
                  }
                  hidden={hideBalance}
                  variant="bodyStrong"
                  color={colors.ink}
                  showSign={false}
                />
              </View>
              {successResult.created_at && (
                <View style={styles.receiptRow}>
                  <Text variant="caption" color={colors.textMuted}>
                    Date & Time
                  </Text>
                  <Text variant="caption" color={colors.ink}>
                    {new Date(successResult.created_at).toLocaleString()}
                  </Text>
                </View>
              )}
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textMuted}>
                  Transaction ID
                </Text>
                <Text variant="caption" color={colors.textMuted} style={styles.idText}>
                  {successResult.id}
                </Text>
              </View>
            </Card>

            <Button
              title="Done"
              variant="secondary"
              onPress={resetState}
              style={styles.actionButton}
            />
          </View>
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
  stepContainer: {
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
  actionButton: {
    marginTop: spacing.md,
    width: '100%',
  },
  navRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  backButton: {
    flex: 1,
  },
  forwardButton: {
    flex: 2,
  },
  reviewCard: {
    padding: spacing.base,
    borderRadius: radius.lg,
    gap: spacing.md,
  },
  reviewHeader: {
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  successIconBox: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  successTitle: {
    marginTop: spacing.xs,
  },
  receiptCard: {
    padding: spacing.base,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  idText: {
    fontFamily: 'monospace',
    fontSize: 11,
  },
});
