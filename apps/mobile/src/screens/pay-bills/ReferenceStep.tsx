import React from 'react';
import { View, StyleSheet } from 'react-native';
import { spacing, type Biller } from '@davao-bank/shared';
import { TextField } from '../../components/TextField';
import { RecipientChip } from '../../components/RecipientChip';
import { describeReferenceFormat } from '../../utils/moneyFlow';
import { getCategoryIcon } from './BillerStep';

interface ReferenceStepProps {
  biller: Biller;
  reference: string;
  refError: string | null;
  onReferenceChange: (ref: string) => void;
}

/** Account number on the bill. The helper is an example, never the regex (spec 7B.4). */
export function ReferenceStep({
  biller,
  reference,
  refError,
  onReferenceChange,
}: ReferenceStepProps) {
  return (
    <View style={styles.stepContainer}>
      <RecipientChip
        label={`To ${biller.name}`}
        icon={getCategoryIcon(biller.category)}
      />
      <TextField
        label={biller.reference_label}
        value={reference}
        onChangeText={onReferenceChange}
        placeholder={`Enter ${biller.reference_label.toLowerCase()}`}
        error={refError || undefined}
        helperText={describeReferenceFormat(biller.reference_pattern)}
        keyboardType="default"
        autoFocus
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stepContainer: {
    gap: spacing.base,
  },
});
