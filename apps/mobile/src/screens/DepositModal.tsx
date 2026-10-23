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
  executeDeposit,
  type AccountBalance,
  type MoneyOperationResult,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';

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
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    accounts[0]?.account_id || ''
  );
  const [amountStr, setAmountStr] = useState('');
  const [reference, setReference] = useState('Online Top-up / Cash-in');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedAccount =
    accounts.find((a) => a.account_id === selectedAccountId) || accounts[0];

  const handleDeposit = async () => {
    setErrorMessage(null);
    const centavos = phpToCentavos(amountStr);

    if (!selectedAccount) {
      setErrorMessage('Please select a destination account.');
      return;
    }
    if (centavos <= 0) {
      setErrorMessage('Deposit amount must be greater than ₱0.00.');
      return;
    }

    setLoading(true);
    const idempotencyKey = generateIdempotencyKey('deposit');

    const { data, error } = await executeDeposit(supabase, {
      account: selectedAccount.account_id,
      amount: centavos,
      idempotency_key: idempotencyKey,
      reference: reference.trim() || 'Simulated Deposit',
    });

    setLoading(false);

    if (error) {
      setErrorMessage(error);
    } else if (data) {
      onDepositSuccess(data);
      resetAndClose();
    }
  };

  const resetAndClose = () => {
    setAmountStr('');
    setErrorMessage(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={resetAndClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalCard}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.modalTitle}>Deposit Funds</Text>
              <Text style={styles.modalSubtitle}>Simulated Top-Up &bull; Cash-In</Text>
            </View>
            <TouchableOpacity onPress={resetAndClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {errorMessage && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.contentBody}>
              {/* Target Account */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Destination Account</Text>
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
                <View style={styles.accountBox}>
                  <Text style={styles.accountNumber}>
                    {selectedAccount?.account_number || '---'}
                  </Text>
                  <Text style={styles.accountMeta}>
                    {selectedAccount?.type.toUpperCase()} &bull; Current Balance:{' '}
                    {formatCentavosToPHP(selectedAccount?.balance || 0)}
                  </Text>
                </View>
              </View>

              {/* Amount */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Amount to Deposit (PHP) *</Text>
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

              {/* Quick Amount Buttons */}
              <View style={styles.quickAmountRow}>
                {[1000, 5000, 10000, 20000].map((quickVal) => (
                  <TouchableOpacity
                    key={quickVal}
                    style={styles.quickChip}
                    onPress={() => setAmountStr(quickVal.toString())}
                  >
                    <Text style={styles.quickChipText}>
                      +₱{quickVal.toLocaleString()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Reference */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Deposit Source / Reference</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Over-the-counter Davao City Branch"
                  placeholderTextColor={colors.textMuted}
                  value={reference}
                  onChangeText={setReference}
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.disabledBtn]}
                onPress={handleDeposit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.textInverse} size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>Confirm Deposit</Text>
                )}
              </TouchableOpacity>
            </View>
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
    maxHeight: '85%',
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
    color: colors.success,
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
  accountBox: {
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: 12,
    padding: 14,
  },
  accountNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.successDark,
  },
  accountMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.success,
    marginTop: 2,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
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
    color: colors.success,
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  quickAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  quickChip: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.successDark,
  },
  primaryBtn: {
    backgroundColor: colors.success,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  disabledBtn: {
    opacity: 0.65,
  },
  primaryBtnText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
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
    backgroundColor: colors.success,
    borderColor: colors.success,
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
