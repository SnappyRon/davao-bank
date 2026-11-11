import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Zap, Calendar, Repeat } from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  type ScheduledPaymentFrequency,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { Chip } from '../../components/Chip';
import { Pressable } from '../../components/Pressable';

export type PaymentTiming = 'now' | 'later' | 'recurring';

interface WhenStepProps {
  timing: PaymentTiming;
  onTimingChange: (timing: PaymentTiming) => void;
  scheduledDate: string;
  onScheduledDateChange: (date: string) => void;
  frequency: ScheduledPaymentFrequency;
  onFrequencyChange: (freq: ScheduledPaymentFrequency) => void;
  maxRunsStr: string;
  onMaxRunsChange: (runs: string) => void;
}

export function WhenStep({
  timing,
  onTimingChange,
  scheduledDate,
  onScheduledDateChange,
  frequency,
  onFrequencyChange,
  maxRunsStr,
  onMaxRunsChange,
}: WhenStepProps) {
  return (
    <View style={styles.stepContainer}>
      <Text variant="label" style={styles.sectionHeader}>
        When
      </Text>

      <Pressable
        style={[styles.timingOption, timing === 'now' && styles.timingOptionActive]}
        onPress={() => onTimingChange('now')}
        feedbackType="scale"
        accessibilityRole="button"
        accessibilityState={{ selected: timing === 'now' }}
        accessibilityLabel="Pay now: pay the bill right away"
      >
        <Zap size={22} color={timing === 'now' ? colors.primary : colors.textSecondary} />
        <View style={styles.timingTextContainer}>
          <Text variant="bodyStrong">Pay now</Text>
          <Text variant="caption" color="textSecondary">
            Pay the bill right away
          </Text>
        </View>
      </Pressable>

      <Pressable
        style={[styles.timingOption, timing === 'later' && styles.timingOptionActive]}
        onPress={() => onTimingChange('later')}
        feedbackType="scale"
        accessibilityRole="button"
        accessibilityState={{ selected: timing === 'later' }}
        accessibilityLabel="Later: pay once on a future date"
      >
        <Calendar
          size={22}
          color={timing === 'later' ? colors.primary : colors.textSecondary}
        />
        <View style={styles.timingTextContainer}>
          <Text variant="bodyStrong">Later</Text>
          <Text variant="caption" color="textSecondary">
            Pay once on a future date
          </Text>
        </View>
      </Pressable>

      <Pressable
        style={[styles.timingOption, timing === 'recurring' && styles.timingOptionActive]}
        onPress={() => onTimingChange('recurring')}
        feedbackType="scale"
        accessibilityRole="button"
        accessibilityState={{ selected: timing === 'recurring' }}
        accessibilityLabel="Recurring: repeat weekly or monthly"
      >
        <Repeat
          size={22}
          color={timing === 'recurring' ? colors.primary : colors.textSecondary}
        />
        <View style={styles.timingTextContainer}>
          <Text variant="bodyStrong">Recurring</Text>
          <Text variant="caption" color="textSecondary">
            Repeat weekly or monthly
          </Text>
        </View>
      </Pressable>

      {timing !== 'now' && (
        <View style={styles.scheduleConfigBox}>
          <TextField
            label="Date (YYYY-MM-DD)"
            value={scheduledDate}
            onChangeText={onScheduledDateChange}
            placeholder="YYYY-MM-DD"
            helperText="Philippine time"
          />

          {timing === 'recurring' && (
            <>
              <Text variant="label" style={styles.configLabel}>
                Frequency
              </Text>
              <View style={styles.freqChipsRow}>
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

              <TextField
                label="Number of payments (optional)"
                value={maxRunsStr}
                onChangeText={onMaxRunsChange}
                placeholder="e.g. 12"
                keyboardType="numeric"
                helperText="Stops after this many payments"
              />
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stepContainer: {
    gap: spacing.base,
  },
  sectionHeader: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  timingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  timingOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  timingTextContainer: {
    marginLeft: spacing.md,
    flex: 1,
  },
  scheduleConfigBox: {
    marginTop: spacing.sm,
    padding: spacing.base,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  configLabel: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  freqChipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
