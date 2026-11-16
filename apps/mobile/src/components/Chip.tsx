import React from 'react';
import { ScrollView, StyleSheet, type ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '@davao-bank/shared';
import { Text } from './Text';
import { Pressable } from './Pressable';

/** Chips and chip-like pills are 36 pt tall (spec 7A.3), with hitSlop to 44. */
export const CHIP_MIN_HEIGHT = 36;

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  style?: ViewStyle;
}

export function Chip({ label, selected = false, onPress, style }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      feedbackType="scale"
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={[styles.chip, selected ? styles.selectedChip : styles.unselectedChip, style]}
    >
      <Text
        variant="label"
        color={selected ? colors.primary : colors.textSecondary}
        style={styles.label}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export interface FilterChipsOption<T extends string = string> {
  id?: T;
  value?: T;
  label: string;
}

export interface FilterChipsProps<T extends string = string> {
  options: FilterChipsOption<T>[];
  selectedId?: T;
  selectedValue?: T;
  onSelect: (val: T) => void;
  style?: ViewStyle;
}

export function FilterChips<T extends string = string>({
  options,
  selectedId,
  selectedValue,
  onSelect,
  style,
}: FilterChipsProps<T>) {
  const activeVal = selectedValue ?? selectedId;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.filterContainer, style]}
    >
      {options.map((opt) => {
        const val = (opt.value ?? opt.id) as T;
        const isSelected = val === activeVal;

        return (
          <Chip
            key={val}
            label={opt.label}
            selected={isSelected}
            onPress={() => onSelect(val)}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: CHIP_MIN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    borderRadius: radius.pill,
    marginRight: spacing.sm,
    borderWidth: 1,
  },
  unselectedChip: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
  },
  selectedChip: {
    backgroundColor: colors.primaryTint,
    borderColor: colors.primary,
  },
  label: {
    fontFamily: typography.fonts.bold,
  },
  filterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
});
