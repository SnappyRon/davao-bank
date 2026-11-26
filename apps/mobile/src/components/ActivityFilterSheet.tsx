import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { colors, spacing } from '@davao-bank/shared';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { Button } from './Button';
import { Chip } from './Chip';
import { TextField } from './TextField';

export type DateRangePreset =
  'all' | 'today' | 'this_week' | '7_days' | '30_days' | 'this_month' | 'custom';

export type ActivityDirection = 'all' | 'in' | 'out';
export type ActivityStatus = 'all' | 'completed' | 'pending' | 'failed' | 'reversed';

export interface ActivityFilterState {
  types: string[];
  datePreset: DateRangePreset;
  customStartDate?: string | null;
  customEndDate?: string | null;
  direction: ActivityDirection;
  status: ActivityStatus;
}

export const DEFAULT_ACTIVITY_FILTERS: ActivityFilterState = {
  types: [],
  datePreset: 'all',
  customStartDate: null,
  customEndDate: null,
  direction: 'all',
  status: 'all',
};

export const TYPE_OPTIONS = [
  { label: 'Transfers', value: 'transfer' },
  { label: 'Bill payments', value: 'bill_payment' },
  { label: 'Cash in', value: 'deposit' },
  { label: 'Cash out', value: 'withdrawal' },
  { label: 'Adjustments', value: 'adjustment' },
  { label: 'Reversals', value: 'reversal' },
];

export const DATE_PRESET_OPTIONS: { label: string; value: DateRangePreset }[] = [
  { label: 'All time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'This week', value: 'this_week' },
  { label: '7 days', value: '7_days' },
  { label: '30 days', value: '30_days' },
  { label: 'This month', value: 'this_month' },
  { label: 'Custom', value: 'custom' },
];

export const DIRECTION_OPTIONS: {
  label: string;
  value: ActivityDirection;
}[] = [
  { label: 'All', value: 'all' },
  { label: 'In', value: 'in' },
  { label: 'Out', value: 'out' },
];

export const STATUS_OPTIONS: { label: string; value: ActivityStatus }[] = [
  { label: 'All', value: 'all' },
  { label: 'Completed', value: 'completed' },
  { label: 'Pending', value: 'pending' },
  { label: 'Failed', value: 'failed' },
  { label: 'Reversed', value: 'reversed' },
];

export function countActiveFilters(filters: ActivityFilterState): number {
  let count = 0;
  if (filters.types.length > 0) count += 1;
  if (filters.datePreset !== 'all') count += 1;
  if (filters.direction !== 'all') count += 1;
  if (filters.status !== 'all') count += 1;
  return count;
}

export function matchesDateRange(
  itemDateIso: string,
  preset: DateRangePreset,
  customStart?: string | null,
  customEnd?: string | null,
  now: Date = new Date()
): boolean {
  if (preset === 'all') return true;
  const txTime = new Date(itemDateIso).getTime();
  if (isNaN(txTime)) return true;

  if (preset === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return txTime >= start.getTime() && txTime <= end.getTime();
  }

  if (preset === 'this_week') {
    const start = new Date(now);
    const day = start.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    start.setDate(start.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    return txTime >= start.getTime();
  }

  if (preset === '7_days') {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return txTime >= start.getTime();
  }

  if (preset === '30_days') {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return txTime >= start.getTime();
  }

  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return txTime >= start.getTime();
  }

  if (preset === 'custom') {
    if (customStart) {
      const s = new Date(customStart).getTime();
      if (!isNaN(s) && txTime < s) return false;
    }
    if (customEnd) {
      const e = new Date(customEnd);
      e.setHours(23, 59, 59, 999);
      if (!isNaN(e.getTime()) && txTime > e.getTime()) return false;
    }
    return true;
  }

  return true;
}

export interface ActivityFilterSheetProps {
  visible: boolean;
  onClose: () => void;
  filters: ActivityFilterState;
  onApply: (filters: ActivityFilterState) => void;
  onClear: () => void;
}

export function ActivityFilterSheet({
  visible,
  onClose,
  filters,
  onApply,
  onClear,
}: ActivityFilterSheetProps) {
  const [draft, setDraft] = useState<ActivityFilterState>(filters);

  useEffect(() => {
    if (visible) {
      setDraft(filters);
    }
  }, [visible, filters]);

  const toggleType = (typeVal: string) => {
    setDraft((prev) => {
      const exists = prev.types.includes(typeVal);
      return {
        ...prev,
        types: exists
          ? prev.types.filter((t) => t !== typeVal)
          : [...prev.types, typeVal],
      };
    });
  };

  const setDatePreset = (preset: DateRangePreset) => {
    setDraft((prev) => ({ ...prev, datePreset: preset }));
  };

  const setDirection = (dir: ActivityDirection) => {
    setDraft((prev) => ({ ...prev, direction: dir }));
  };

  const setStatus = (st: ActivityStatus) => {
    setDraft((prev) => ({ ...prev, status: st }));
  };

  const handleClear = () => {
    setDraft(DEFAULT_ACTIVITY_FILTERS);
    onClear();
  };

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      footer={
        <View style={styles.footerRow}>
          <Button
            title="Clear"
            variant="secondary"
            onPress={handleClear}
            style={styles.footerButton}
            accessibilityLabel="Clear"
          />
          <Button
            title="Apply"
            variant="primary"
            onPress={handleApply}
            style={styles.footerButton}
            accessibilityLabel="Apply"
          />
        </View>
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.sheetBody}
        keyboardShouldPersistTaps="handled"
      >
        {/* Transaction type */}
        <View style={styles.section}>
          <Text variant="bodyStrong" color={colors.ink} style={styles.sectionTitle}>
            Transaction type
          </Text>
          <View style={styles.chipsWrap}>
            {TYPE_OPTIONS.map((opt) => {
              const isSelected = draft.types.includes(opt.value);
              return (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  selected={isSelected}
                  onPress={() => toggleType(opt.value)}
                  style={styles.chip}
                />
              );
            })}
          </View>
        </View>

        {/* Date range */}
        <View style={styles.section}>
          <Text variant="bodyStrong" color={colors.ink} style={styles.sectionTitle}>
            Date range
          </Text>
          <View style={styles.chipsWrap}>
            {DATE_PRESET_OPTIONS.map((opt) => {
              const isSelected = draft.datePreset === opt.value;
              return (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  selected={isSelected}
                  onPress={() => setDatePreset(opt.value)}
                  style={styles.chip}
                />
              );
            })}
          </View>
          {draft.datePreset === 'custom' ? (
            <View style={styles.customDateRow}>
              <View style={styles.customDateField}>
                <TextField
                  label="Start date"
                  placeholder="YYYY-MM-DD"
                  value={draft.customStartDate ?? ''}
                  onChangeText={(val) =>
                    setDraft((prev) => ({ ...prev, customStartDate: val }))
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.customDateField}>
                <TextField
                  label="End date"
                  placeholder="YYYY-MM-DD"
                  value={draft.customEndDate ?? ''}
                  onChangeText={(val) =>
                    setDraft((prev) => ({ ...prev, customEndDate: val }))
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          ) : null}
        </View>

        {/* Direction */}
        <View style={styles.section}>
          <Text variant="bodyStrong" color={colors.ink} style={styles.sectionTitle}>
            Direction
          </Text>
          <View style={styles.chipsWrap}>
            {DIRECTION_OPTIONS.map((opt) => {
              const isSelected = draft.direction === opt.value;
              return (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  selected={isSelected}
                  onPress={() => setDirection(opt.value)}
                  style={styles.chip}
                />
              );
            })}
          </View>
        </View>

        {/* Status */}
        <View style={styles.section}>
          <Text variant="bodyStrong" color={colors.ink} style={styles.sectionTitle}>
            Status
          </Text>
          <View style={styles.chipsWrap}>
            {STATUS_OPTIONS.map((opt) => {
              const isSelected = draft.status === opt.value;
              return (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  selected={isSelected}
                  onPress={() => setStatus(opt.value)}
                  style={styles.chip}
                />
              );
            })}
          </View>
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheetBody: {
    paddingBottom: spacing.lg,
    gap: spacing.base,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    marginRight: 0,
    marginBottom: spacing.xs,
  },
  customDateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  customDateField: {
    flex: 1,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.base,
    paddingTop: spacing.xs,
  },
  footerButton: {
    flex: 1,
  },
});
