import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CheckCircle2, Clock } from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  formatCentavosToPHP,
  type Biller,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import type { PaymentTiming } from './WhenStep';

interface SuccessStepProps {
  biller: Biller;
  reference: string;
  centavos: number;
  timing: PaymentTiming;
  scheduledDate: string;
  receiptTxId: string | null;
  serverResult?: {
    id?: string;
    transaction_id?: string;
    amount?: number | string;
    idempotent_replay?: boolean;
    [key: string]: any;
  } | null;
  onDone: () => void;
}

export function SuccessStep({
  biller,
  reference,
  centavos,
  timing,
  scheduledDate,
  receiptTxId,
  serverResult,
  onDone,
}: SuccessStepProps) {
  const displayAmount =
    timing === 'now'
      ? serverResult?.amount == null
        ? null
        : Number(serverResult.amount)
      : centavos;
  const displayTxId =
    timing === 'now' ? serverResult?.transaction_id || serverResult?.id : receiptTxId;

  return (
    <View style={styles.successContainer}>
      <View style={styles.successIconWrapper}>
        {timing === 'now' ? (
          <CheckCircle2 size={56} color={colors.primary} />
        ) : (
          <Clock size={56} color={colors.primary} />
        )}
      </View>

      <Text variant="h1" style={styles.successTitle}>
        {timing === 'now' ? 'Payment Completed' : `Scheduled for ${scheduledDate}`}
      </Text>

      {serverResult?.idempotent_replay && (
        <Text
          variant="caption"
          color={colors.orangeText}
          style={{ marginTop: spacing.xs }}
        >
          This payment was already processed
        </Text>
      )}

      <Text variant="body" color="textSecondary" style={styles.successSubtitle}>
        {timing === 'now'
          ? `Successfully paid ${biller.name}`
          : `Your bill payment instruction for ${biller.name} has been scheduled.`}
      </Text>

      <Card style={styles.receiptCard}>
        <View style={styles.reviewRow}>
          <Text variant="caption" color="textSecondary">
            Amount
          </Text>
          <Text variant="title" color="ink">
            {displayAmount == null ? 'Unavailable' : formatCentavosToPHP(displayAmount)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.reviewRow}>
          <Text variant="caption" color="textSecondary">
            Biller
          </Text>
          <Text variant="bodyStrong">{biller.name}</Text>
        </View>
        <View style={styles.reviewRow}>
          <Text variant="caption" color="textSecondary">
            Reference
          </Text>
          <Text variant="bodyStrong">{reference}</Text>
        </View>
        {displayTxId && (
          <View style={styles.reviewRow}>
            <Text variant="caption" color="textSecondary">
              Ref ID
            </Text>
            <Text variant="caption" color="textMuted">
              {displayTxId.slice(0, 8)}...
            </Text>
          </View>
        )}
      </Card>

      <Button title="Done" variant="primary" onPress={onDone} style={styles.fullButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  successContainer: {
    alignItems: 'center',
    paddingVertical: spacing.base,
  },
  successIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  successTitle: {
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  successSubtitle: {
    textAlign: 'center',
    marginBottom: spacing.base,
    paddingHorizontal: spacing.base,
  },
  receiptCard: {
    width: '100%',
    padding: spacing.base,
    gap: spacing.md,
    marginBottom: spacing.base,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  fullButton: {
    width: '100%',
    marginTop: spacing.base,
  },
});
