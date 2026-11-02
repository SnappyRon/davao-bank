import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Zap, Calendar, Repeat } from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  type ScheduledPaymentFrequency,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';

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
  onBack: () => void;
  onContinue: () => void;
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
  onBack,
  onContinue,
}: WhenStepProps) {
  return (
    <View style={styles.stepContainer}>
      <Text variant="label" style={styles.sectionHeader}>
        Choose Payment Timing
      </Text>

      <TouchableOpacity
        style={[styles.timingOption, timing === 'now' && styles.timingOptionActive]}
        onPress={() => onTimingChange('now')}
      >
        <Zap size={22} color={timing === 'now' ? colors.primary : colors.textSecondary} />
        <View style={styles.timingTextContainer}>
          <Text variant="bodyStrong">Pay Now</Text>
          <Text variant="caption" color="textSecondary">
            Execute payment immediately
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.timingOption, timing === 'later' && styles.timingOptionActive]}
        onPress={() => onTimingChange('later')}
      >
        <Calendar
          size={22}
          color={timing === 'later' ? colors.primary : colors.textSecondary}
        />
        <View style={styles.timingTextContainer}>
          <Text variant="bodyStrong">Schedule for Later</Text>
          <Text variant="caption" color="textSecondary">
            Pay once on a future date
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.timingOption, timing === 'recurring' && styles.timingOptionActive]}
        onPress={() => onTimingChange('recurring')}
      >
        <Repeat
          size={22}
          color={timing === 'recurring' ? colors.primary : colors.textSecondary}
        />
        <View style={styles.timingTextContainer}>
          <Text variant="bodyStrong">Recurring Payment</Text>
          <Text variant="caption" color="textSecondary">
            Repeat weekly or monthly automatically
          </Text>
        </View>
      </TouchableOpacity>

      {timing !== 'now' && (
        <View style={styles.scheduleConfigBox}>
          <TextField
            label="Execution Date (YYYY-MM-DD)"
            value={scheduledDate}
            onChangeText={onScheduledDateChange}
            placeholder="YYYY-MM-DD"
            helperText="Date when the payment will execute (Asia/Manila time)"
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
                label="Max Executions (optional)"
                value={maxRunsStr}
                onChangeText={onMaxRunsChange}
                placeholder="e.g. 12"
                keyboardType="numeric"
                helperText="Stops automatically after this number of runs"
              />
            </>
          )}
        </View>
      )}

      <View style={styles.buttonRow}>
        <Button title="Back" variant="ghost" onPress={onBack} style={styles.halfButton} />
        <Button
          title="Continue"
          variant="primary"
          onPress={onContinue}
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
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.base,
  },
  halfButton: {
    flex: 1,
  },
});
