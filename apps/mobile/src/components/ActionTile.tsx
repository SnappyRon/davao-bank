import React, { createContext, useContext } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing } from '@davao-bank/shared';
import { Text } from './Text';
import { Pressable } from './Pressable';

export type ActionTileColor = 'blue' | 'green' | 'orange' | 'yellow' | 'red' | 'primary';

/** Spec 7B.1: 40 pt colour disc, tile `minHeight: 96`. */
const DISC_SIZE = 40;
const TILE_MIN_HEIGHT = 96;

export interface ActionTileProps {
  label: string;
  color: ActionTileColor;
  /** Icon drawn on the disc: white, or ink on yellow (see `actionTileIconColor`). */
  icon: React.ReactNode;
  onPress: () => void;
  style?: ViewStyle;
}

/** Tiles size themselves for the grid they sit in (3 columns on Home). */
const GridColumnsContext = createContext<2 | 3>(2);

const DISC_COLORS: Record<ActionTileColor, string> = {
  blue: colors.blue,
  green: colors.green,
  orange: colors.orange,
  yellow: colors.yellow,
  red: colors.red,
  primary: colors.primary,
};

/** Festival fills carry white icons, except yellow, which always carries ink. */
export function actionTileIconColor(color: ActionTileColor): string {
  return color === 'yellow' ? colors.ink : colors.textInverse;
}

export function ActionTile({ label, color, icon, onPress, style }: ActionTileProps) {
  const columns = useContext(GridColumnsContext);
  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptic optional
    }
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      feedbackType="scale"
      onPress={handlePress}
      style={[styles.tile, columns === 3 ? styles.tileThird : styles.tileHalf, style]}
    >
      <View style={[styles.disc, { backgroundColor: DISC_COLORS[color] }]}>{icon}</View>
      <Text variant="label" color={colors.ink}>
        {label}
      </Text>
    </Pressable>
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
      <GridColumnsContext.Provider value={columns}>
        {children}
      </GridColumnsContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  gridTwoCol: {
    justifyContent: 'space-between',
  },
  gridThreeCol: {
    justifyContent: 'flex-start',
  },
  tile: {
    flexGrow: 1,
    minHeight: TILE_MIN_HEIGHT,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  // Basis below 1/3 (or 1/2) so the 12 pt gaps fit; flexGrow fills the row.
  tileThird: {
    flexBasis: '30%',
  },
  tileHalf: {
    flexBasis: '45%',
  },
  disc: {
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
