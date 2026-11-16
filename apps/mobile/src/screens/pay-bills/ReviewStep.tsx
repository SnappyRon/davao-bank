import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  formatCentavosToPHP,
  type Biller,
  type AccountBalance,
  type ScheduledPaymentFrequency,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { ReviewCard } from '../../components/ReviewCard';
import { formatAccountLabel } from '../../components/AccountPickerSheet';
import { formatWhen } from '../../utils/moneyFlow';
import type { PaymentTiming } from './WhenStep';

interface ReviewStepProps {
  biller: Biller;
  account: AccountBalance | undefined;
  reference: string;
  centavos: number;
  timing: PaymentTiming;
  scheduledDate: string;
  frequency: ScheduledPaymentFrequency;
  maxRunsStr: string;
  errorMessage: string | null;
  hideBalance: boolean;
  /** Opens the account picker (only passed with 2+ accounts). */
  onChangeSource?: () => void;
}

/** Spec 7B.4 Review: the commit button lives in the screen's sticky footer. */
export function ReviewStep({
  biller,
  account,
  reference,
  centavos,
  timing,
  scheduledDate,
  frequency,
  maxRunsStr,
  errorMessage,
  hideBalance,
  onChangeSource,
}: ReviewStepProps) {
  return (
    <View style={styles.stepContainer}>
      {errorMessage ? (
        <View style={styles.errorBox}>
          <AlertCircle size={18} color={colors.redText} />
          <Text
            variant="caption"
            color={colors.redText}
            accessibilityRole="alert"
            style={styles.errorText}
          >
            {errorMessage}
          </Text>
        </View>
      ) : null}
      <ReviewCard
        eyebrow={timing === 'now' ? "You're paying" : "You're scheduling"}
        amountCentavos={centavos}
        rows={[
          {
            label: 'From',
            value: account ? formatAccountLabel(account) : '',
            onPress: onChangeSource,
          },
          { label: 'To', value: biller.name },
          { label: biller.reference_label, value: reference.trim() },
          {
            label: 'When',
            value: formatWhen(timing, scheduledDate, frequency, maxRunsStr),
          },
          {
            label: 'Balance after',
            value:
              timing === 'now' && account
                ? hideBalance
                  ? '₱••••••'
                  : formatCentavosToPHP(account.balance - centavos)
                : '',
            valueAccessibilityLabel: hideBalance ? 'Amount hidden' : undefined,
          },
          { label: 'Fee', value: 'Free' },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stepContainer: {
    gap: spacing.base,
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
});
