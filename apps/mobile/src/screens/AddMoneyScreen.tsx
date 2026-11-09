import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { PlusCircle, AlertCircle } from 'lucide-react-native';
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
  fetchAccountBalances,
  formatReferenceId,
  type AccountBalance,
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
  AmountText,
  ResultView,
} from '../components';

export function AddMoneyScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { hideBalance } = useSettings();

  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [amountStr, setAmountStr] = useState('');
  const [reference, setReference] = useState('Online Top-up');
  const [step, setStep] = useState<'input' | 'review' | 'success'>('input');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<MoneyOperationResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    generateIdempotencyKey('deposit')
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

  return (
    <FeatureScreen
      title={
        step === 'input'
          ? 'Add money'
          : step === 'review'
            ? 'Review add money'
            : 'Add money'
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
              title={`Add ${formatCentavosToPHP(centavosAmount)}`}
              onPress={handleConfirmDeposit}
              loading={loading}
              icon={<PlusCircle size={18} color={colors.textInverse} />}
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
                You're adding
              </Text>
              <AmountText
                amountCentavos={centavosAmount}
                direction="incoming"
                variant="display"
                showSign={false}
              />
            </View>

            <View style={styles.reviewRow}>
              <Text variant="body" color={colors.textSecondary}>
                To account
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
                amountCentavos={(selectedAccount?.balance || 0) + centavosAmount}
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
