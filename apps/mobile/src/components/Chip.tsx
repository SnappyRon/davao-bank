import React from 'react';
import { TouchableOpacity, ScrollView, StyleSheet, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@davao-bank/shared';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  style?: ViewStyle;
}

export function Chip({ label, selected = false, onPress, style }: ChipProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.chip, selected ? styles.selectedChip : styles.unselectedChip, style]}
    >
      <Text
        variant="label"
        color={selected ? colors.primary : colors.textSecondary}
        style={styles.label}
      >
        {label}
      </Text>
    </TouchableOpacity>
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
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
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
    fontWeight: '700',
  },
  filterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
});
