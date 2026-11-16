import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing, type ScheduledPaymentFrequency } from '@davao-bank/shared';
import { Text } from './Text';
import { TextField } from './TextField';
import { Chip } from './Chip';

export type PaymentTiming = 'now' | 'later' | 'recurring';

export interface WhenPickerProps {
  timing: PaymentTiming;
  onTimingChange: (timing: PaymentTiming) => void;
  scheduledDate: string;
  onScheduledDateChange: (date: string) => void;
  frequency: ScheduledPaymentFrequency;
  onFrequencyChange: (freq: ScheduledPaymentFrequency) => void;
  maxRunsStr: string;
  onMaxRunsChange: (runs: string) => void;
}

/**
 * One "When" control for every money flow that can be scheduled (Transfer,
 * Pay bills): Now / Later / Recurring chips, then the date, frequency and
 * number of payments when they apply.
 */
export function WhenPicker({
  timing,
  onTimingChange,
  scheduledDate,
  onScheduledDateChange,
  frequency,
  onFrequencyChange,
  maxRunsStr,
  onMaxRunsChange,
}: WhenPickerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text variant="label" color={colors.textSecondary}>
          When
        </Text>
        <View style={styles.chipRow}>
          <Chip
            label="Now"
            selected={timing === 'now'}
            onPress={() => onTimingChange('now')}
          />
          <Chip
            label="Later"
            selected={timing === 'later'}
            onPress={() => onTimingChange('later')}
          />
          <Chip
            label="Recurring"
            selected={timing === 'recurring'}
            onPress={() => onTimingChange('recurring')}
          />
        </View>
      </View>

      {timing !== 'now' && (
        <TextField
          label={timing === 'recurring' ? 'Start date' : 'Date'}
          value={scheduledDate}
          onChangeText={onScheduledDateChange}
          placeholder="YYYY-MM-DD"
          helperText="Philippine time"
          maxLength={10}
        />
      )}

      {timing === 'recurring' && (
        <>
          <View style={styles.section}>
            <Text variant="label" color={colors.textSecondary}>
              Repeats
            </Text>
            <View style={styles.chipRow}>
              <Chip
                label="Weekly"
                selected={frequency === 'weekly'}
                onPress={() => onFrequencyChange('weekly')}
              />
              <Chip
                label="Monthly"
                selected={frequency === 'monthly'}
                onPress={() => onFrequencyChange('monthly')}
              />
            </View>
          </View>
          <TextField
            label="Number of payments (optional)"
            value={maxRunsStr}
            onChangeText={onMaxRunsChange}
            placeholder="e.g. 12"
            keyboardType="number-pad"
            maxLength={3}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.base,
  },
  section: {
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
});
