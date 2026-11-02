import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Zap, Droplet, Wifi, Smartphone, Layers } from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  type Biller,
  type BillerCategory,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { Chip } from '../../components/Chip';

interface BillerStepProps {
  billers: Biller[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  onSelectBiller: (biller: Biller) => void;
}

export const getCategoryIcon = (category: BillerCategory) => {
  switch (category) {
    case 'electricity':
      return <Zap size={20} color={colors.yellow} />;
    case 'water':
      return <Droplet size={20} color={colors.blue} />;
    case 'internet':
      return <Wifi size={20} color={colors.primary} />;
    case 'mobile':
      return <Smartphone size={20} color={colors.orange} />;
    default:
      return <Layers size={20} color={colors.textSecondary} />;
  }
};

export function BillerStep({
  billers,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onSelectCategory,
  onSelectBiller,
}: BillerStepProps) {
  const filteredBillers = billers.filter((b) => {
    const matchesCategory = selectedCategory === 'all' || b.category === selectedCategory;
    const matchesSearch =
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.reference_label.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <View style={styles.stepContainer}>
      <TextField
        placeholder="Search biller or utility..."
        value={searchQuery}
        onChangeText={onSearchChange}
        accessibilityLabel="Search billers"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryChips}
      >
        {[
          { id: 'all', label: 'All' },
          { id: 'electricity', label: 'Electricity' },
          { id: 'water', label: 'Water' },
          { id: 'internet', label: 'Internet' },
          { id: 'mobile', label: 'Mobile' },
        ].map((cat) => (
          <Chip
            key={cat.id}
            label={cat.label}
            selected={selectedCategory === cat.id}
            onPress={() => onSelectCategory(cat.id)}
          />
        ))}
      </ScrollView>

      <View style={styles.billerList}>
        {filteredBillers.map((biller) => (
          <TouchableOpacity
            key={biller.id}
            style={styles.billerRow}
            onPress={() => onSelectBiller(biller)}
            accessibilityRole="button"
            accessibilityLabel={`Select ${biller.name}`}
          >
            <View style={styles.billerIconContainer}>
              {getCategoryIcon(biller.category)}
            </View>
            <View style={styles.billerTextContainer}>
              <Text variant="bodyStrong">{biller.name}</Text>
              <Text variant="caption" color="textSecondary">
                {biller.reference_label}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {filteredBillers.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text variant="body" color="textMuted">
              No billers found in this category.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepContainer: {
    gap: spacing.base,
  },
  categoryChips: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  billerList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  billerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
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
  emptyContainer: {
    padding: spacing['4xl'],
    alignItems: 'center',
  },
});
