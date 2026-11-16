import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { colors, radius, spacing, size, formatCentavosToPHP } from '@davao-bank/shared';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { REVIEW_FOOTNOTE } from '../utils/moneyFlow';

export interface ReviewCardRow {
  label: string;
  value: string;
  /** Spoken value when it differs from what is shown (e.g. a hidden balance). */
  valueAccessibilityLabel?: string;
  /** Makes the row a button that changes this value (the account picker). */
  onPress?: () => void;
  /** Spoken action for a pressable row. Default "Change account". */
  changeLabel?: string;
}

/** Chevron on a pressable row. */
const ROW_ICON_SIZE = 18;

export interface ReviewCardProps {
  /** "You're sending", "You're paying", "You're adding", … */
  eyebrow: string;
  amountCentavos: number;
  /** From, To, Note, When, Fee… rows with an empty value are left out. */
  rows: ReviewCardRow[];
  footnote?: string;
  style?: ViewStyle;
}

/**
 * The one Review layout for every money flow (spec 7B.4): `surfaceSubtle`,
 * radius 16, padding 20, the eyebrow above the amount in `amount` with no
 * sign, then the rows, then the footnote.
 */
export function ReviewCard({
  eyebrow,
  amountCentavos,
  rows,
  footnote = REVIEW_FOOTNOTE,
  style,
}: ReviewCardProps) {
  const visibleRows = rows.filter((row) => row.value);
  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <Text variant="caption" color={colors.textSecondary} align="center">
          {eyebrow}
        </Text>
        <Text
          variant="amount"
          color={colors.ink}
          tabularNums
          align="center"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          maxFontSizeMultiplier={1.4}
        >
          {formatCentavosToPHP(Math.abs(amountCentavos))}
        </Text>
      </View>

      <View style={styles.rows}>
        {visibleRows.map((row) => {
          const content = (
            <>
              <Text variant="body" color={colors.textSecondary} style={styles.rowLabel}>
                {row.label}
              </Text>
              <View style={styles.rowValueBox}>
                <Text
                  variant="bodyStrong"
                  color={colors.ink}
                  align="right"
                  tabularNums
                  style={styles.rowValue}
                  accessibilityLabel={row.valueAccessibilityLabel}
                >
                  {row.value}
                </Text>
                {row.onPress ? (
                  <ChevronDown size={ROW_ICON_SIZE} color={colors.primary} />
                ) : null}
              </View>
            </>
          );
          if (row.onPress) {
            return (
              <Pressable
                key={row.label}
                accessibilityRole="button"
                accessibilityLabel={`${row.label}: ${row.valueAccessibilityLabel ?? row.value}. ${row.changeLabel ?? 'Change account'}`}
                feedbackType="highlight"
                onPress={row.onPress}
                style={[styles.row, styles.pressableRow]}
              >
                {content}
              </Pressable>
            );
          }
          return (
            <View key={row.label} style={styles.row}>
              {content}
            </View>
          );
        })}
      </View>

      <Text variant="caption" color={colors.textMuted} align="center">
        {footnote}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.base,
  },
  header: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rows: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  pressableRow: {
    minHeight: size.touch,
  },
  rowLabel: {
    flexShrink: 0,
  },
  rowValueBox: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowValue: {
    flexShrink: 1,
  },
});
