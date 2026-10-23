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
  executeWithdraw,
  type AccountBalance,
  type MoneyOperationResult,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';

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
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    accounts[0]?.account_id || ''
  );
  const [amountStr, setAmountStr] = useState('');
  const [reference, setReference] = useState('ATM / Cash Out Simulation');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedAccount =
    accounts.find((a) => a.account_id === selectedAccountId) || accounts[0];

  const handleWithdraw = async () => {
    setErrorMessage(null);
    const centavos = phpToCentavos(amountStr);

    if (!selectedAccount) {
      setErrorMessage('Please select a source account.');
      return;
    }
    if (centavos <= 0) {
      setErrorMessage('Withdrawal amount must be greater than ₱0.00.');
      return;
    }

    // Client-side quick check (server is authoritative and will re-verify under lock)
    if (centavos > selectedAccount.balance) {
      setErrorMessage(
        `Insufficient funds. Available balance: ${formatCentavosToPHP(selectedAccount.balance)}`
      );
      return;
    }

    setLoading(true);
    const idempotencyKey = generateIdempotencyKey('withdraw');

    const { data, error } = await executeWithdraw(supabase, {
      account: selectedAccount.account_id,
      amount: centavos,
      idempotency_key: idempotencyKey,
      reference: reference.trim() || 'Simulated Cash Out',
    });

    setLoading(false);

    if (error) {
      // Surface insufficient funds or account error from server
      setErrorMessage(error);
    } else if (data) {
      onWithdrawSuccess(data);
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
              <Text style={styles.title}>Simulated Withdrawal</Text>
              <Text style={styles.subtitle}>ATM / Over-the-counter cash out</Text>
            </View>
            <TouchableOpacity
              onPress={resetAndClose}
              disabled={loading}
              style={styles.closeBtn}
              accessibilityLabel="Close withdraw modal"
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
            </View>
          )}

          <ScrollView
            contentContainerStyle={styles.contentBody}
            keyboardShouldPersistTaps="handled"
          >
            {/* Account Selector */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>SOURCE ACCOUNT</Text>
              {accounts.length > 1 ? (
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
              ) : null}

              {selectedAccount && (
                <View style={styles.accountBox}>
                  <Text style={styles.accountNumber}>
                    {selectedAccount.account_number}
                  </Text>
                  <Text style={styles.accountMeta}>
                    {selectedAccount.type.toUpperCase()} • {selectedAccount.currency} •
                    Available: {formatCentavosToPHP(selectedAccount.balance)}
                  </Text>
                </View>
              )}
            </View>

            {/* Amount input */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>WITHDRAW AMOUNT (PHP)</Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.currencyPrefix}>₱</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={amountStr}
                  onChangeText={(val) => {
                    setAmountStr(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  editable={!loading}
                />
              </View>

              {/* Quick Amount Chips */}
              <View style={styles.quickAmountRow}>
                {[500, 1000, 5000, 10000].map((preset) => (
                  <TouchableOpacity
                    key={preset}
                    style={styles.quickChip}
                    onPress={() => setAmountStr(String(preset))}
                    disabled={loading}
                  >
                    <Text style={styles.quickChipText}>+₱{preset.toLocaleString()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Reference */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>REFERENCE / PURPOSE</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. ATM Cash Out"
                placeholderTextColor={colors.textMuted}
                value={reference}
                onChangeText={setReference}
                editable={!loading}
              />
            </View>

            {/* Informational Callout */}
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>
                💡 Davao Bank is a simulated academic prototype. Withdrawals debit your
                ledger balance atomically and trigger in-app audit notifications.
              </Text>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                (loading || !amountStr || parseFloat(amountStr) <= 0) &&
                  styles.disabledBtn,
              ]}
              onPress={handleWithdraw}
              disabled={loading || !amountStr || parseFloat(amountStr) <= 0}
            >
              {loading ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.primaryBtnText}>Confirm Withdrawal</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
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
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  errorBox: {
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
  accountBox: {
    backgroundColor: colors.surfaceHover,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
  },
  accountNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  accountMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
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
    color: colors.error,
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
    color: colors.errorDark,
  },
  infoBanner: {
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 10,
    padding: 12,
  },
  infoBannerText: {
    fontSize: 12,
    color: colors.warningDark,
    lineHeight: 16,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
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
});
