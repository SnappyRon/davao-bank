import React from 'react';
import { View, StyleSheet, ScrollView, Image } from 'react-native';
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
import { Pressable } from '../../components/Pressable';
import { GuidanceTip } from '../../components/GuidanceTip';

interface BillerStepProps {
  billers: Biller[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  onSelectBiller: (biller: Biller) => void;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const categoryImages: Partial<Record<BillerCategory, ReturnType<typeof require>>> = {
  electricity: require('../../../assets/icons/billers/biller-category-electricity.png'),
  water: require('../../../assets/icons/billers/biller-category-water.png'),
  internet: require('../../../assets/icons/billers/biller-category-internet.png'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

export const getCategoryIcon = (category: BillerCategory, iconSize = 40) => {
  const imageSource = categoryImages[category];
  if (imageSource) {
    return (
      <Image
        source={imageSource}
        style={{ width: iconSize, height: iconSize }}
        resizeMode="contain"
        accessible={false}
      />
    );
  }

  const iconDim = Math.round(iconSize * 0.55);
  switch (category) {
    case 'electricity':
      return <Zap size={iconDim} color={colors.yellow} />;
    case 'water':
      return <Droplet size={iconDim} color={colors.blue} />;
    case 'internet':
      return <Wifi size={iconDim} color={colors.primary} />;
    case 'mobile':
      return <Smartphone size={iconDim} color={colors.orange} />;
    default:
      return <Layers size={iconDim} color={colors.textSecondary} />;
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
      <GuidanceTip
        storageKey="tip_pay_bills_seen"
        tipText="Search for your utility or choose a category below to pay a bill."
      />
      <TextField
        placeholder="Search biller or utility..."
        value={searchQuery}
        onChangeText={onSearchChange}
        accessibilityLabel="Search billers"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.categoryChips}
      >
        {[
          { id: 'all', label: 'All', icon: undefined },
          {
            id: 'electricity',
            label: 'Electricity',
            icon: getCategoryIcon('electricity', 16),
          },
          { id: 'water', label: 'Water', icon: getCategoryIcon('water', 16) },
          { id: 'internet', label: 'Internet', icon: getCategoryIcon('internet', 16) },
          { id: 'mobile', label: 'Mobile', icon: getCategoryIcon('mobile', 16) },
        ].map((cat) => (
          <Chip
            key={cat.id}
            label={cat.label}
            icon={cat.icon}
            selected={selectedCategory === cat.id}
            onPress={() => onSelectCategory(cat.id)}
          />
        ))}
      </ScrollView>

      <View style={styles.billerList}>
        {filteredBillers.map((biller) => (
          <Pressable
            key={biller.id}
            style={styles.billerRow}
            onPress={() => onSelectBiller(biller)}
            feedbackType="highlight"
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
          </Pressable>
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
