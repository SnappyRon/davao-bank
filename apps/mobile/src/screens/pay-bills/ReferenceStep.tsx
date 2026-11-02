import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius, spacing, type Biller } from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { getCategoryIcon } from './BillerStep';

interface ReferenceStepProps {
  biller: Biller;
  reference: string;
  refError: string | null;
  onReferenceChange: (ref: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function ReferenceStep({
  biller,
  reference,
  refError,
  onReferenceChange,
  onBack,
  onContinue,
}: ReferenceStepProps) {
  return (
    <View style={styles.stepContainer}>
      <Card style={styles.billerHeaderCard}>
        <View style={styles.billerCardRow}>
          <View style={styles.billerIconContainer}>
            {getCategoryIcon(biller.category)}
          </View>
          <View style={styles.billerTextContainer}>
            <Text variant="title">{biller.name}</Text>
            <Badge variant="neutral" label={biller.category} />
          </View>
        </View>
      </Card>

      <TextField
        label={biller.reference_label}
        value={reference}
        onChangeText={onReferenceChange}
        placeholder={`Enter ${biller.reference_label.toLowerCase()}`}
        error={refError || undefined}
        helperText={`Required pattern: ${biller.reference_pattern}`}
        keyboardType="default"
        autoFocus
      />

      <View style={styles.buttonRow}>
        <Button title="Back" variant="ghost" onPress={onBack} style={styles.halfButton} />
        <Button
          title="Continue"
          variant="primary"
          onPress={onContinue}
          disabled={!reference.trim()}
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
  billerHeaderCard: {
    padding: spacing.base,
    backgroundColor: colors.primaryTint,
  },
  billerCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  billerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  billerTextContainer: {
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
