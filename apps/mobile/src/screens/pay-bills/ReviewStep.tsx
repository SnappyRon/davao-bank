import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  type Biller,
  type AccountBalance,
  type ScheduledPaymentFrequency,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { AmountText } from '../../components/AmountText';
import type { PaymentTiming } from './WhenStep';

interface ReviewStepProps {
  biller: Biller;
  account: AccountBalance | undefined;
  reference: string;
  centavos: number;
  timing: PaymentTiming;
  scheduledDate: string;
  frequency: ScheduledPaymentFrequency;
  loading: boolean;
  errorMessage: string | null;
  onBack: () => void;
  onSubmit: () => void;
}

export function ReviewStep({
  biller,
  account,
  reference,
  centavos,
  timing,
  scheduledDate,
  frequency,
  loading,
  errorMessage,
  onBack,
  onSubmit,
}: ReviewStepProps) {
  return (
    <View style={styles.stepContainer}>
      <Card style={styles.reviewCard}>
        <View style={styles.reviewHeader}>
          <Text variant="caption" color="textSecondary">
            TOTAL AMOUNT
          </Text>
          <AmountText amountCentavos={centavos} variant="display" direction="outgoing" />
        </View>

        <View style={styles.divider} />

        <View style={styles.reviewRow}>
          <Text variant="body" color="textSecondary">
            Biller
          </Text>
          <Text variant="bodyStrong">{biller.name}</Text>
        </View>

        <View style={styles.reviewRow}>
          <Text variant="body" color="textSecondary">
            {biller.reference_label}
          </Text>
          <Text variant="bodyStrong">{reference}</Text>
        </View>

        <View style={styles.reviewRow}>
          <Text variant="body" color="textSecondary">
            From Account
          </Text>
          <Text variant="bodyStrong">{account?.account_number || ''}</Text>
        </View>

        <View style={styles.reviewRow}>
          <Text variant="body" color="textSecondary">
            Timing
          </Text>
          <Text variant="bodyStrong">
            {timing === 'now'
              ? 'Immediate Payment'
              : timing === 'later'
                ? `Once on ${scheduledDate}`
                : `${frequency === 'weekly' ? 'Weekly' : 'Monthly'} starting ${scheduledDate}`}
          </Text>
        </View>

        <View style={styles.reviewRow}>
          <Text variant="body" color="textSecondary">
            Bank Fee
          </Text>
          <Text variant="bodyStrong" color="primary">
            ₱0.00 (Free)
          </Text>
        </View>
      </Card>

      {errorMessage && (
        <View style={styles.errorBox}>
          <AlertCircle size={18} color={colors.redText} />
          <Text variant="caption" color="redText" style={styles.errorText}>
            {errorMessage}
          </Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <Button
          title="Back"
          variant="ghost"
          onPress={onBack}
          disabled={loading}
          style={styles.halfButton}
        />
        <Button
          title={timing === 'now' ? 'Confirm & Pay' : 'Confirm Schedule'}
          variant="primary"
          onPress={onSubmit}
          loading={loading}
          style={styles.halfButton}
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
    gap: spacing.md,
  },
  reviewHeader: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.tintRed,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  errorText: {
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.base,
  },
  halfButton: {
    flex: 1,
  },
});
