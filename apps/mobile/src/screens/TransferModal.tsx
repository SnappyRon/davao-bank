import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import {
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  X,
  CreditCard,
  Send,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  colors,
  spacing,
  radius,
  formatCentavosToPHP,
  phpToCentavos,
  generateIdempotencyKey,
  executeTransfer,
  type AccountBalance,
  type MoneyOperationResult,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import {
  BottomSheet,
  Text,
  TextField,
  AmountInput,
  Button,
  Card,
  AmountText,
  Badge,
} from '../components';

interface TransferModalProps {
  visible: boolean;
  onClose: () => void;
  accounts: AccountBalance[];
  onTransferSuccess: (result: MoneyOperationResult) => void;
}

type TransferStep = 'recipient' | 'amount' | 'review' | 'success';

export function TransferModal({
  visible,
  onClose,
  accounts,
  onTransferSuccess,
}: TransferModalProps) {
  const [step, setStep] = useState<TransferStep>('recipient');
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    accounts[0]?.account_id || ''
  );
  const [recipientAccountNumber, setRecipientAccountNumber] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [reference, setReference] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<MoneyOperationResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const selectedAccount =
    accounts.find((a) => a.account_id === selectedAccountId) || accounts[0];

  const resetState = () => {
    setStep('recipient');
    setRecipientAccountNumber('');
    setAmountStr('');
    setReference('');
    setErrorMessage(null);
    setSuccessResult(null);
    setIdempotencyKey('');
    onClose();
  };

  const handleNextFromRecipient = () => {
    setErrorMessage(null);
    const cleaned = recipientAccountNumber.trim();
    if (!cleaned) {
      setErrorMessage('Please enter an account number');
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
      setErrorMessage(
        `Insufficient funds. Available: ${formatCentavosToPHP(selectedAccount.balance)}`
      );
      return;
    }

    // Generate idempotency key for this attempt
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
      onTransferSuccess(data);
    }
  };

  const centavosAmount = phpToCentavos(amountStr);

  return (
    <BottomSheet
      visible={visible}
      onClose={resetState}
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
          <View style={styles.stepContainer}>
            <Text variant="body" color={colors.textSecondary}>
              Enter the 10-digit Davao Bank account number of the recipient.
            </Text>

            <TextField
              label="Recipient Account Number"
              value={recipientAccountNumber}
              onChangeText={setRecipientAccountNumber}
              placeholder="e.g. 1020441785"
              keyboardType="number-pad"
              maxLength={10}
            />

            <View style={styles.sourceSelector}>
              <Text
                variant="label"
                color={colors.textSecondary}
                style={styles.fieldLabel}
              >
                Source Account
              </Text>
              <Card variant="subtle" style={styles.accountCard}>
                <CreditCard size={20} color={colors.primary} />
                <View style={styles.accountInfo}>
                  <Text variant="bodyStrong" tabularNums color={colors.ink}>
                    {selectedAccount?.account_number}
                  </Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    Available: {formatCentavosToPHP(selectedAccount?.balance || 0)}
                  </Text>
                </View>
              </Card>
            </View>

            <Button
              title="Continue"
              onPress={handleNextFromRecipient}
              style={styles.actionButton}
            />
          </View>
        )}

        {/* STEP 2: AMOUNT */}
        {step === 'amount' && (
          <View style={styles.stepContainer}>
            <AmountInput
              label="Amount to Transfer"
              value={amountStr}
              onChangeText={setAmountStr}
              presetAmounts={[100, 500, 1000, 5000]}
              helperText={`Available: ${formatCentavosToPHP(selectedAccount?.balance || 0)}`}
            />

            <TextField
              label="Note / Reference (Optional)"
              value={reference}
              onChangeText={setReference}
              placeholder="e.g. Lunch split"
              maxLength={60}
            />

            <View style={styles.navRow}>
              <Button
                title="Back"
                variant="ghost"
                onPress={() => setStep('recipient')}
                style={styles.backButton}
              />
              <Button
                title="Review"
                onPress={handleNextFromAmount}
                style={styles.forwardButton}
              />
            </View>
          </View>
        )}

        {/* STEP 3: REVIEW */}
        {step === 'review' && (
          <View style={styles.stepContainer}>
            <Card variant="subtle" style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <Text variant="caption" color={colors.textMuted}>
                  TOTAL AMOUNT
                </Text>
                <AmountText
                  amountCentavos={centavosAmount}
                  direction="outgoing"
                  variant="display"
                />
              </View>

              <View style={styles.reviewRow}>
                <Text variant="body" color={colors.textSecondary}>
                  From
                </Text>
                <Text variant="bodyStrong" tabularNums color={colors.ink}>
                  {selectedAccount?.account_number}
                </Text>
              </View>

              <View style={styles.reviewRow}>
                <Text variant="body" color={colors.textSecondary}>
                  To
                </Text>
                <Text variant="bodyStrong" tabularNums color={colors.ink}>
                  {recipientAccountNumber}
                </Text>
              </View>

              {reference ? (
                <View style={styles.reviewRow}>
                  <Text variant="body" color={colors.textSecondary}>
                    Note
                  </Text>
                  <Text variant="bodyStrong" color={colors.ink}>
                    {reference}
                  </Text>
                </View>
              ) : null}

              <View style={styles.reviewRow}>
                <Text variant="body" color={colors.textSecondary}>
                  New Balance
                </Text>
                <Text variant="bodyStrong" tabularNums color={colors.ink}>
                  {formatCentavosToPHP((selectedAccount?.balance || 0) - centavosAmount)}
                </Text>
              </View>
            </Card>

            <View style={styles.navRow}>
              <Button
                title="Back"
                variant="ghost"
                onPress={() => setStep('amount')}
                style={styles.backButton}
              />
              <Button
                title="Confirm Transfer"
                onPress={handleConfirmTransfer}
                loading={loading}
                icon={<Send size={18} color={colors.textInverse} />}
                style={styles.forwardButton}
              />
            </View>
          </View>
        )}

        {/* STEP 4: SUCCESS */}
        {step === 'success' && successResult && (
          <View style={styles.stepContainer}>
            <View style={styles.successIconBox}>
              <CheckCircle2 size={54} color={colors.primary} />
              <Text variant="h2" align="center" style={styles.successTitle}>
                Transfer Sent
              </Text>
              <AmountText
                amountCentavos={centavosAmount}
                direction="outgoing"
                variant="display"
              />
            </View>

            <Card variant="subtle" style={styles.receiptCard}>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textMuted}>
                  Recipient
                </Text>
                <Text variant="bodyStrong" tabularNums color={colors.ink}>
                  {recipientAccountNumber}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textMuted}>
                  Updated Balance
                </Text>
                <Text variant="bodyStrong" tabularNums color={colors.ink}>
                  {formatCentavosToPHP((selectedAccount?.balance || 0) - centavosAmount)}
                </Text>
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
  sourceSelector: {
    gap: spacing.xs,
  },
  fieldLabel: {
    marginBottom: spacing.xs,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  accountInfo: {
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
