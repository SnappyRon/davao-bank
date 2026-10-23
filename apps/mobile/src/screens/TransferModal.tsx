import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  colors,
  formatCentavosToPHP,
  phpToCentavos,
  generateIdempotencyKey,
  executeTransfer,
  type AccountBalance,
  type MoneyOperationResult,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';

interface TransferModalProps {
  visible: boolean;
  onClose: () => void;
  accounts: AccountBalance[];
  onTransferSuccess: (result: MoneyOperationResult) => void;
}

export function TransferModal({
  visible,
  onClose,
  accounts,
  onTransferSuccess,
}: TransferModalProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    accounts[0]?.account_id || ''
  );
  const [recipientAccountNumber, setRecipientAccountNumber] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [reference, setReference] = useState('');
  const [step, setStep] = useState<'input' | 'confirm' | 'success'>('input');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<MoneyOperationResult | null>(null);

  // Maintain client idempotency key across retries of the same submission
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const selectedAccount =
    accounts.find((a) => a.account_id === selectedAccountId) || accounts[0];

  const handleProceedToConfirm = () => {
    setErrorMessage(null);
    const centavos = phpToCentavos(amountStr);

    if (!selectedAccount) {
      setErrorMessage('Please select a source account.');
      return;
    }
    if (!recipientAccountNumber.trim()) {
      setErrorMessage('Please enter the recipient account number.');
      return;
    }
    if (recipientAccountNumber.trim() === selectedAccount.account_number) {
      setErrorMessage('Cannot transfer funds to the same source account.');
      return;
    }
    if (centavos <= 0) {
      setErrorMessage('Transfer amount must be greater than ₱0.00.');
      return;
    }
    if (centavos > selectedAccount.balance) {
      setErrorMessage(
        `Insufficient funds. Available balance: ${formatCentavosToPHP(selectedAccount.balance)}`
      );
      return;
    }

    // Generate new idempotency key for this fresh transfer flow
    setIdempotencyKey(generateIdempotencyKey('transfer'));
    setStep('confirm');
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
      setErrorMessage(error);
    } else if (data) {
      setSuccessResult(data);
      setStep('success');
      onTransferSuccess(data);
    }
  };

  const resetForm = () => {
    setRecipientAccountNumber('');
    setAmountStr('');
    setReference('');
    setStep('input');
    setErrorMessage(null);
    setSuccessResult(null);
    setIdempotencyKey('');
    onClose();
  };

  const centavosAmount = phpToCentavos(amountStr);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={resetForm}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.modalTitle}>
                {step === 'success' ? 'Transfer Completed' : 'Send Money'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {step === 'confirm'
                  ? 'Step 2 of 2: Confirm Details'
                  : step === 'success'
                    ? 'Official Electronic Transaction Receipt'
                    : 'Fast, secure peer-to-peer transfers'}
              </Text>
            </View>
            <TouchableOpacity onPress={resetForm} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {errorMessage && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false}>
            {step === 'input' && (
              <View style={styles.contentBody}>
                {/* Source Account Selector */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Source Account</Text>
                  {accounts.length > 1 && (
                    <View style={styles.accountChoiceRow}>
                      {accounts.map((acc) => (
                        <TouchableOpacity
                          key={acc.account_id}
                          style={[
                            styles.accountChip,
                            (selectedAccountId || accounts[0]?.account_id) ===
                              acc.account_id && styles.accountChipActive,
                          ]}
                          onPress={() => setSelectedAccountId(acc.account_id)}
                        >
                          <Text
                            style={[
                              styles.accountChipText,
                              (selectedAccountId || accounts[0]?.account_id) ===
                                acc.account_id && styles.accountChipTextActive,
                            ]}
                          >
                            {acc.type.toUpperCase()} •••• {acc.account_number.slice(-4)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <View style={styles.sourceAccountBox}>
                    <View style={styles.sourceLeft}>
                      <Text style={styles.sourceAccNumber}>
                        {selectedAccount?.account_number || '---'}
                      </Text>
                      <Text style={styles.sourceAccType}>
                        {selectedAccount?.type.toUpperCase()} • Available:{' '}
                        {formatCentavosToPHP(selectedAccount?.balance || 0)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Recipient Account Number */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Recipient Davao Bank Account *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 1012345678"
                    placeholderTextColor={colors.textMuted}
                    value={recipientAccountNumber}
                    onChangeText={setRecipientAccountNumber}
                    keyboardType="numeric"
                    maxLength={14}
                  />
                  <Text style={styles.fieldHint}>
                    10-digit Davao Bank savings or checking account number
                  </Text>
                </View>

                {/* Amount Input */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Transfer Amount (PHP) *</Text>
                  <View style={styles.amountInputRow}>
                    <Text style={styles.currencyPrefix}>₱</Text>
                    <TextInput
                      style={styles.amountInput}
                      placeholder="0.00"
                      placeholderTextColor={colors.textMuted}
                      value={amountStr}
                      onChangeText={setAmountStr}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                {/* Reference Note */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Reference / Purpose (Optional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Kadayawan feast contribution"
                    placeholderTextColor={colors.textMuted}
                    value={reference}
                    onChangeText={setReference}
                    maxLength={50}
                  />
                </View>

                {/* Action Button */}
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={handleProceedToConfirm}
                >
                  <Text style={styles.primaryBtnText}>Review Transfer</Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 'confirm' && (
              <View style={styles.contentBody}>
                <View style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <Text style={styles.reviewAmount}>
                      {formatCentavosToPHP(centavosAmount)}
                    </Text>
                    <Text style={styles.reviewSub}>Simulated Real-Time Transfer</Text>
                  </View>

                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewLabel}>From Account</Text>
                    <Text style={styles.reviewVal}>
                      {selectedAccount?.account_number}
                    </Text>
                  </View>

                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewLabel}>To Account</Text>
                    <Text style={styles.reviewVal}>{recipientAccountNumber.trim()}</Text>
                  </View>

                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewLabel}>Transfer Fee</Text>
                    <Text style={[styles.reviewVal, { color: colors.success }]}>
                      ₱0.00 (Waived)
                    </Text>
                  </View>

                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewLabel}>Reference</Text>
                    <Text style={styles.reviewVal}>
                      {reference.trim() || 'Funds Transfer'}
                    </Text>
                  </View>

                  <View style={styles.idempotencyTag}>
                    <Text style={styles.idempotencyText}>
                      Idempotency Key: {idempotencyKey.substring(0, 20)}...
                    </Text>
                  </View>
                </View>

                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => setStep('input')}
                    disabled={loading}
                  >
                    <Text style={styles.secondaryBtnText}>Back</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      styles.flexBtn,
                      loading && styles.disabledBtn,
                    ]}
                    onPress={handleConfirmTransfer}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color={colors.textInverse} size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Confirm &amp; Send</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {step === 'success' && successResult && (
              <View style={styles.contentBody}>
                <View style={styles.successBadgeCircle}>
                  <Text style={styles.successIcon}>✓</Text>
                </View>

                <Text style={styles.successTitle}>Transfer Successful!</Text>
                <Text style={styles.successAmount}>
                  {formatCentavosToPHP(successResult.amount)}
                </Text>

                <View style={styles.receiptCard}>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Transaction Reference</Text>
                    <Text style={styles.receiptVal}>{successResult.reference}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Transaction ID</Text>
                    <Text style={[styles.receiptVal, styles.monoText]}>
                      {successResult.id.substring(0, 18)}...
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Recipient Account</Text>
                    <Text style={styles.receiptVal}>{successResult.to_account}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Status</Text>
                    <Text
                      style={[
                        styles.receiptVal,
                        { color: colors.success, fontWeight: '700' },
                      ]}
                    >
                      Completed
                    </Text>
                  </View>
                  {successResult.idempotent_replay && (
                    <Text style={styles.replayNotice}>
                      (Idempotent Replay: Retried with duplicate key)
                    </Text>
                  )}
                </View>

                <TouchableOpacity style={styles.primaryBtn} onPress={resetForm}>
                  <Text style={styles.primaryBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(58, 74, 82, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.neutralLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  errorBanner: {
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  errorText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '600',
  },
  contentBody: {
    gap: 16,
    paddingBottom: 20,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  fieldHint: {
    fontSize: 11,
    color: colors.textMuted,
  },
  sourceAccountBox: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
    borderRadius: 12,
    padding: 14,
  },
  sourceLeft: {
    gap: 2,
  },
  sourceAccNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  sourceAccType: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  currencyPrefix: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.accent,
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  flexBtn: {
    flex: 1,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.65,
  },
  reviewCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  reviewHeader: {
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reviewAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
  },
  reviewSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  reviewVal: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  idempotencyTag: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  idempotencyText: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  successBadgeCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.successLight,
    borderWidth: 2,
    borderColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 8,
  },
  successIcon: {
    fontSize: 32,
    color: colors.success,
    fontWeight: '800',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 8,
  },
  successAmount: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
  },
  receiptCard: {
    backgroundColor: colors.background,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  receiptLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  receiptVal: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  replayNotice: {
    fontSize: 11,
    color: colors.accent,
    textAlign: 'center',
    marginTop: 4,
  },
  accountChoiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  accountChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  accountChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  accountChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  accountChipTextActive: {
    color: colors.textInverse,
  },
});
