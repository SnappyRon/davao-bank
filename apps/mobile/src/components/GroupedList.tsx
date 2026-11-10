import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@davao-bank/shared';

/**
 * Shared list metrics (spec 7B "Lists"): one grouped card per section,
 * radius 16, 1 px border, rows with a 40 pt icon disc, and hairlines inset
 * so they start where the row text starts:
 *   row padding (16) + disc (40) + gap between disc and text (16) = 72.
 * Every grouped list (Home, Coming up, account picker, Activity, Inbox) uses
 * these constants so the inset stays the same everywhere.
 */
export const LIST_DISC_SIZE = 40;
export const LIST_ICON_SIZE = 20;
export const LIST_ROW_MIN_HEIGHT = 64;
export const LIST_ROW_PADDING_VERTICAL = spacing.md;
export const LIST_ROW_PADDING_HORIZONTAL = spacing.base;
export const LIST_ROW_GAP = spacing.base;
export const LIST_HAIRLINE_INSET =
  LIST_ROW_PADDING_HORIZONTAL + LIST_DISC_SIZE + LIST_ROW_GAP;

export const groupedListStyles = StyleSheet.create({
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: LIST_ROW_GAP,
    minHeight: LIST_ROW_MIN_HEIGHT,
    paddingVertical: LIST_ROW_PADDING_VERTICAL,
    paddingHorizontal: LIST_ROW_PADDING_HORIZONTAL,
  },
  disc: {
    width: LIST_DISC_SIZE,
    height: LIST_DISC_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Hairline placed between rows in normal flow. */
  hairline: {
    marginLeft: LIST_HAIRLINE_INSET,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  /** Hairline drawn at the bottom of a row (absolute, inside the row). */
  hairlineAbsolute: {
    position: 'absolute',
    left: LIST_HAIRLINE_INSET,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});

export interface GroupedListProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** One grouped card; children are rows, separated with `ListHairline`. */
export function GroupedList({ children, style, testID }: GroupedListProps) {
  return (
    <View style={[groupedListStyles.group, style]} testID={testID}>
      {children}
    </View>
  );
}

/** Hairline between two rows, inset to the row text (72). */
export function ListHairline() {
  return <View style={groupedListStyles.hairline} />;
}
