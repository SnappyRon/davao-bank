import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { colors, radius, spacing, phpToCentavos } from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { AmountInput } from '../../components/AmountInput';
import { Button } from '../../components/Button';

interface RequestMoneyTabProps {
  reqPayerAccount: string;
  onPayerAccountChange: (account: string) => void;
  reqAmountStr: string;
  onAmountChange: (amount: string) => void;
  reqNote: string;
  onNoteChange: (note: string) => void;
  reqLoading: boolean;
  reqError: string | null;
  onSendRequest: () => void;
}

export function RequestMoneyTab({
  reqPayerAccount,
  onPayerAccountChange,
  reqAmountStr,
  onAmountChange,
  reqNote,
  onNoteChange,
  reqLoading,
  reqError,
  onSendRequest,
}: RequestMoneyTabProps) {
  return (
    <View style={styles.requestForm}>
      <Text variant="body" color={colors.textSecondary}>
        Send a formal payment request to another Davao Bank customer. They can review and
        authorize it with biometrics.
      </Text>

      {reqError && (
        <View style={styles.errorBox}>
          <AlertCircle size={16} color={colors.error} />
          <Text variant="caption" color={colors.error} style={{ flex: 1 }}>
            {reqError}
          </Text>
        </View>
      )}

      <TextField
        label="Payer account number"
        value={reqPayerAccount}
        onChangeText={onPayerAccountChange}
        placeholder="e.g. 1020441785"
        keyboardType="number-pad"
        maxLength={10}
      />

      <AmountInput label="Amount" value={reqAmountStr} onChangeText={onAmountChange} />

      <TextField
        label="Note (optional)"
        value={reqNote}
        onChangeText={onNoteChange}
        placeholder="e.g. Dinner bill share, Durian delivery"
        maxLength={60}
      />

      <View style={styles.reqNotice}>
        <Text variant="caption" color={colors.textMuted}>
          Privacy guarantee: Neither your full name nor the payer's name is revealed in
          notifications. Account numbers only.
        </Text>
      </View>

      <Button
        title="Send payment request"
        variant="primary"
        loading={reqLoading}
        onPress={onSendRequest}
        disabled={
          reqLoading ||
          !/^[0-9]{10}$/.test(reqPayerAccount.trim()) ||
          phpToCentavos(reqAmountStr) <= 0
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  requestForm: {
    gap: spacing.base,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.error,
  },
  reqNotice: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSubtle,
  },
});
