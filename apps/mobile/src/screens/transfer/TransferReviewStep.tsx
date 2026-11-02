import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Send, Calendar } from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  type AccountBalance,
  type ScheduledPaymentFrequency,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { AmountText } from '../../components/AmountText';
import type { TransferTiming } from './TransferAmountStep';

interface TransferReviewStepProps {
  centavosAmount: number;
  selectedAccount: AccountBalance | undefined;
  recipientAccountNumber: string;
  recipientNickname: string;
  reference: string;
  timing: TransferTiming;
  scheduledDate: string;
  frequency: ScheduledPaymentFrequency;
  maxRunsStr: string;
  hideBalance: boolean;
  loading: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

export function TransferReviewStep({
  centavosAmount,
  selectedAccount,
  recipientAccountNumber,
  recipientNickname,
  reference,
  timing,
  scheduledDate,
  frequency,
  maxRunsStr,
  hideBalance,
  loading,
  onBack,
  onConfirm,
}: TransferReviewStepProps) {
  return (
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
            {recipientNickname
              ? `${recipientNickname} (${recipientAccountNumber})`
              : recipientAccountNumber}
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

        {/* Timing info (§C.4) */}
        {timing !== 'now' && (
          <View style={styles.reviewRow}>
            <Text variant="body" color={colors.textSecondary}>
              {timing === 'recurring' ? 'Starts' : 'Scheduled'}
            </Text>
            <Text variant="bodyStrong" color={colors.ink}>
              {scheduledDate}
            </Text>
          </View>
        )}
        {timing === 'recurring' && (
          <View style={styles.reviewRow}>
            <Text variant="body" color={colors.textSecondary}>
              Frequency
            </Text>
            <Text variant="bodyStrong" color={colors.ink}>
              {frequency.charAt(0).toUpperCase() + frequency.slice(1)}
              {maxRunsStr ? ` · ${maxRunsStr} runs` : ''}
            </Text>
          </View>
        )}

        {timing === 'now' && (
          <View style={styles.reviewRow}>
            <Text variant="body" color={colors.textSecondary}>
              Projected Balance
            </Text>
            <AmountText
              amountCentavos={(selectedAccount?.balance || 0) - centavosAmount}
              hidden={hideBalance}
              variant="bodyStrong"
              color={colors.ink}
              showSign={false}
            />
          </View>
        )}
      </Card>

      <View style={styles.navRow}>
        <Button title="Back" variant="ghost" onPress={onBack} style={styles.backButton} />
        <Button
          title={
            timing === 'now'
              ? 'Authorize Transfer'
              : timing === 'recurring'
                ? 'Schedule Recurring'
                : 'Schedule Transfer'
          }
          onPress={onConfirm}
          loading={loading}
          icon={
            timing === 'now' ? (
              <Send size={18} color={colors.textInverse} />
            ) : (
              <Calendar size={18} color={colors.textInverse} />
            )
          }
          style={styles.forwardButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepContainer: {
    gap: spacing.base,
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
});
