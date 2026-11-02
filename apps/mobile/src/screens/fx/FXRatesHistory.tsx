import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius, spacing, formatFXRate, type FXRate } from '@davao-bank/shared';
import { Text } from '../../components/Text';

interface FXRatesHistoryProps {
  rates: FXRate[];
  baseCurrency: string;
}

export function FXRatesHistory({ rates, baseCurrency }: FXRatesHistoryProps) {
  return (
    <View style={styles.historySection}>
      <Text variant="bodyStrong" color={colors.ink} style={{ marginBottom: spacing.sm }}>
        Recent Reference Rates
      </Text>

      <View style={styles.historyCard}>
        <View style={styles.historyHeaderRow}>
          <Text variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
            Date
          </Text>
          <Text
            variant="caption"
            color={colors.textMuted}
            style={{ width: 100, textAlign: 'right' }}
          >
            Rate (PHP)
          </Text>
        </View>

        {rates
          .slice(-7)
          .reverse()
          .map((r, index) => (
            <View
              key={r.rate_date}
              style={[styles.historyRow, index > 0 && styles.historyBorder]}
            >
              <Text variant="body" color={colors.ink} style={{ flex: 1 }}>
                {r.rate_date}
              </Text>
              <Text
                variant="bodyStrong"
                color={colors.ink}
                style={{ width: 100, textAlign: 'right' }}
              >
                ₱{formatFXRate(Number(r.rate), baseCurrency)}
              </Text>
            </View>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  historySection: {
    marginTop: spacing.md,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  historyBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
