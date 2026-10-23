import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { PlusCircle, CheckCircle2, AlertCircle, CreditCard } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  colors,
  spacing,
  radius,
  formatCentavosToPHP,
  phpToCentavos,
  generateIdempotencyKey,
  executeDeposit,
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

interface DepositModalProps {
  visible: boolean;
  onClose: () => void;
  accounts: AccountBalance[];
  onDepositSuccess: (result: MoneyOperationResult) => void;
}

export function DepositModal({
  visible,
  onClose,
  accounts,
  onDepositSuccess,
}: DepositModalProps) {
  const { hideBalance } = useSettings();
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    accounts[0]?.account_id || ''
  );
  const [amountStr, setAmountStr] = useState('');
  const [reference, setReference] = useState('Online Top-up');
  const [step, setStep] = useState<'input' | 'review' | 'success'>('input');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<MoneyOperationResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const selectedAccount =
    accounts.find((a) => a.account_id === selectedAccountId) || accounts[0];

  const resetState = () => {
    setStep('input');
    setAmountStr('');
    setReference('Online Top-up');
    setErrorMessage(null);
    setSuccessResult(null);
    setIdempotencyKey('');
    onClose();
  };

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
      setErrorMessage(error);
    } else if (data) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // Haptics optional
      }
      setSuccessResult(data);
      setStep('success');
      onDepositSuccess(data);
    }
  };

  const centavosAmount = phpToCentavos(amountStr);

  return (
    <BottomSheet
      visible={visible}
      onClose={resetState}
      title={
        step === 'input'
          ? 'Cash-in · Add Money'
          : step === 'review'
            ? 'Cash-in · Review'
            : 'Cash-in Successful'
      }
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
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
              label="Deposit Amount"
              value={amountStr}
              onChangeText={setAmountStr}
              presetAmounts={[500, 1000, 2000, 5000]}
              helperText={`Current Balance: ${hideBalance ? '₱••••••' : formatCentavosToPHP(selectedAccount?.balance || 0)}`}
            />

            <TextField
              label="Reference / Source"
              value={reference}
              onChangeText={setReference}
              placeholder="e.g. Bank Over-the-counter"
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
                  TOTAL TO ADD
                </Text>
                <AmountText
                  amountCentavos={centavosAmount}
                  direction="incoming"
                  variant="display"
                />
              </View>

              <View style={styles.reviewRow}>
                <Text variant="body" color={colors.textSecondary}>
                  Destination Account
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
                  amountCentavos={(selectedAccount?.balance || 0) + centavosAmount}
                  hidden={hideBalance}
                  variant="bodyStrong"
                  color={colors.primary}
                  showSign={false}
                />
              </View>
            </Card>

            <View style={styles.navRow}>
              <Button
                title="Back"
                variant="ghost"
                onPress={() => setStep('input')}
                style={styles.backButton}
              />
              <Button
                title="Confirm Cash-in"
                onPress={handleConfirmDeposit}
                loading={loading}
                icon={<PlusCircle size={18} color={colors.textInverse} />}
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
                Money Added
              </Text>
              <AmountText
                amountCentavos={centavosAmount}
                direction="incoming"
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
                  amountCentavos={(selectedAccount?.balance || 0) + centavosAmount}
                  hidden={hideBalance}
                  variant="bodyStrong"
                  color={colors.primary}
                  showSign={false}
                />
              </View>
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
