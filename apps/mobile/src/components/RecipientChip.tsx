import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '@davao-bank/shared';
import { Text } from './Text';
import { CHIP_MIN_HEIGHT } from './Chip';

export interface RecipientChipProps {
  /** "To Mama · •• 7943", "To Apo Fiber Internet", "From Savings •• 8921" */
  label: string;
  icon?: React.ReactNode;
}

/** Shows who the money goes to at the top of the amount step (spec 7B.4). */
export function RecipientChip({ label, icon }: RecipientChipProps) {
  return (
    <View style={styles.chip} accessible accessibilityLabel={label}>
      {icon}
      <Text variant="label" color={colors.ink} numberOfLines={1} style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: CHIP_MIN_HEIGHT,
    maxWidth: '100%',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    flexShrink: 1,
  },
});
