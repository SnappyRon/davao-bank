import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CheckCircle2, Calendar } from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  type MoneyOperationResult,
  type ScheduledPaymentFrequency,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { AmountText } from '../../components/AmountText';
import type { TransferTiming } from './TransferAmountStep';

interface TransferSuccessStepProps {
  successResult: MoneyOperationResult | null;
  isScheduledSuccess: boolean;
  timing: TransferTiming;
  scheduledDate: string;
  frequency: ScheduledPaymentFrequency;
  centavosAmount: number;
  recipientNickname: string;
  recipientAccountNumber: string;
  selectedAccountBalance: number;
  hideBalance: boolean;
  onDone: () => void;
}

export function TransferSuccessStep({
  successResult,
  isScheduledSuccess,
  timing,
  scheduledDate,
  frequency,
  centavosAmount,
  recipientNickname,
  recipientAccountNumber,
  selectedAccountBalance,
  hideBalance,
  onDone,
}: TransferSuccessStepProps) {
  if (successResult) {
    return (
      <View style={styles.stepContainer}>
        <View style={styles.successIconBox}>
          <CheckCircle2 size={54} color={colors.primary} />
          <Text variant="h2" align="center" style={styles.successTitle}>
            Transfer Sent
          </Text>
          {successResult.idempotent_replay && (
            <Text variant="caption" color={colors.orangeText} style={styles.replayNotice}>
              This payment was already processed
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
              Recipient
            </Text>
            <Text variant="bodyStrong" tabularNums color={colors.ink}>
              {recipientNickname
                ? `${recipientNickname} (${recipientAccountNumber})`
                : recipientAccountNumber}
            </Text>
          </View>
          <View style={styles.receiptRow}>
            <Text variant="caption" color={colors.textMuted}>
              Updated Balance
            </Text>
            <AmountText
              amountCentavos={
                successResult.from_new_balance ??
                successResult.new_balance ??
                selectedAccountBalance
              }
              hidden={hideBalance}
              variant="bodyStrong"
              color={colors.ink}
              showSign={false}
            />
          </View>
          <View style={styles.receiptRow}>
            <Text variant="caption" color={colors.textMuted}>
              Transaction ID
            </Text>
            <Text variant="caption" color={colors.textMuted} style={styles.idText}>
              {successResult.id || successResult.transaction_id}
            </Text>
          </View>
        </Card>

        <Button
          title="Done"
          variant="secondary"
          onPress={onDone}
          style={styles.actionButton}
        />
      </View>
    );
  }

  if (isScheduledSuccess) {
    return (
      <View style={styles.stepContainer}>
        <View style={styles.successIconBox}>
          <Calendar size={54} color={colors.primary} />
          <Text variant="h2" align="center" style={styles.successTitle}>
            {timing === 'recurring'
              ? 'Recurring Transfer Scheduled'
              : 'Transfer Scheduled'}
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
              {recipientNickname
                ? `${recipientNickname} (${recipientAccountNumber})`
                : recipientAccountNumber}
            </Text>
          </View>
          <View style={styles.receiptRow}>
            <Text variant="caption" color={colors.textMuted}>
              {timing === 'recurring' ? 'Starting' : 'Scheduled for'}
            </Text>
            <Text variant="bodyStrong" color={colors.ink}>
              {scheduledDate}
            </Text>
          </View>
          {timing === 'recurring' && (
            <View style={styles.receiptRow}>
              <Text variant="caption" color={colors.textMuted}>
                Frequency
              </Text>
              <Text variant="bodyStrong" color={colors.ink}>
                {frequency.charAt(0).toUpperCase() + frequency.slice(1)}
              </Text>
            </View>
          )}
        </Card>

        <Button
          title="Done"
          variant="secondary"
          onPress={onDone}
          style={styles.actionButton}
        />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  stepContainer: {
    gap: spacing.base,
  },
  successIconBox: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  successTitle: {
    marginTop: spacing.xs,
  },
  replayNotice: {
    marginTop: 2,
    marginBottom: spacing.xs,
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
  actionButton: {
    marginTop: spacing.md,
    width: '100%',
  },
});
