import React from 'react';
import { TouchableOpacity, StyleSheet, View, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing } from '@davao-bank/shared';
import { Text } from './Text';

export type ActionTileColor = 'blue' | 'green' | 'orange' | 'yellow' | 'purple';

export interface ActionTileProps {
  label: string;
  color: ActionTileColor;
  icon: React.ReactNode;
  onPress: () => void;
  style?: ViewStyle;
}

export function ActionTile({ label, color, icon, onPress, style }: ActionTileProps) {
  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptic optional
    }
    onPress();
  };

  const getBackgroundColor = () => {
    switch (color) {
      case 'blue':
        return colors.blue;
      case 'green':
        return colors.green;
      case 'orange':
        return colors.orange;
      case 'yellow':
        return colors.yellow;
      case 'purple':
        return colors.primary;
    }
  };

  const isYellow = color === 'yellow';
  const textColor = isYellow ? colors.ink : colors.textInverse;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={handlePress}
      style={[styles.tile, { backgroundColor: getBackgroundColor() }, style]}
    >
      <View style={styles.iconContainer}>{icon}</View>
      <Text variant="title" color={textColor} style={styles.label}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export interface ActionTileGridProps {
  children: React.ReactNode;
  columns?: 2 | 3;
  style?: ViewStyle;
}

export function ActionTileGrid({ children, columns = 2, style }: ActionTileGridProps) {
  return (
    <View
      style={[
        styles.grid,
        columns === 3 ? styles.gridThreeCol : styles.gridTwoCol,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginVertical: spacing.md,
  },
  gridTwoCol: {
    justifyContent: 'space-between',
  },
  gridThreeCol: {
    justifyContent: 'flex-start',
  },
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 110,
    borderRadius: radius.lg,
    padding: spacing.lg,
    justifyContent: 'space-between',
    elevation: 2,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  iconContainer: {
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 18,
    fontWeight: '800',
  },
});
