import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AlertCircle, CheckCircle2 } from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  formatCentavosToPHP,
  phpToCentavos,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { AmountInput } from '../../components/AmountInput';
import { Button } from '../../components/Button';

interface RequestMoneyTabProps {
  reqSuccess: boolean;
  reqPayerAccount: string;
  onPayerAccountChange: (account: string) => void;
  reqAmountStr: string;
  onAmountChange: (amount: string) => void;
  reqNote: string;
  onNoteChange: (note: string) => void;
  reqLoading: boolean;
  reqError: string | null;
  onSendRequest: () => void;
  onReset: () => void;
}

export function RequestMoneyTab({
  reqSuccess,
  reqPayerAccount,
  onPayerAccountChange,
  reqAmountStr,
  onAmountChange,
  reqNote,
  onNoteChange,
  reqLoading,
  reqError,
  onSendRequest,
  onReset,
}: RequestMoneyTabProps) {
  if (reqSuccess) {
    return (
      <View style={styles.reqSuccessBox}>
        <CheckCircle2 size={54} color={colors.primary} />
        <Text variant="h2" color={colors.primary} style={styles.successTitle}>
          Request Sent!
        </Text>
        <Text variant="body" color={colors.textSecondary} style={styles.successDesc}>
          Your payment request of{' '}
          <Text variant="bodyStrong" color={colors.ink}>
            {formatCentavosToPHP(phpToCentavos(reqAmountStr))}
          </Text>{' '}
          was sent to account {reqPayerAccount}. You will receive a notification as soon
          as they authorize the transfer.
        </Text>

        <Button
          title="Done"
          variant="primary"
          onPress={onReset}
          style={{ marginTop: spacing.md }}
        />
      </View>
    );
  }

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
        label="Payer Account Number"
        value={reqPayerAccount}
        onChangeText={onPayerAccountChange}
        placeholder="e.g. 1020441785"
        keyboardType="number-pad"
        maxLength={10}
      />

      <AmountInput
        label="Amount to Request"
        value={reqAmountStr}
        onChangeText={onAmountChange}
      />

      <TextField
        label="Reason / Note (Optional, max 60 chars)"
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
        title="Send Payment Request"
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
  reqSuccessBox: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  successTitle: {
    fontWeight: '800',
  },
  successDesc: {
    textAlign: 'center',
    lineHeight: 22,
  },
});
