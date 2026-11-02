import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { TrendingUp, TrendingDown, Globe } from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  type FXPair,
  type FXPeriod,
  type FXSummary,
  formatFXRate,
  formatFXChange,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { Badge } from '../../components/Badge';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import type { ChartPoint } from './FXRatesChart';

export const PAIR_OPTIONS: { pair: FXPair; base: string; label: string }[] = [
  { pair: 'USD/PHP', base: 'USD', label: 'USD / PHP' },
  { pair: 'EUR/PHP', base: 'EUR', label: 'EUR / PHP' },
  { pair: 'JPY/PHP', base: 'JPY', label: 'JPY / PHP' },
];

export const PERIOD_OPTIONS: { period: FXPeriod; label: string }[] = [
  { period: '1W', label: '1W' },
  { period: '1M', label: '1M' },
  { period: '3M', label: '3M' },
  { period: '1Y', label: '1Y' },
];

interface FXRatesHeroProps {
  selectedPair: FXPair;
  selectedPeriod: FXPeriod;
  onSelectPair: (pair: FXPair) => void;
  onSelectPeriod: (period: FXPeriod) => void;
  loading: boolean;
  summary: FXSummary | null;
  activePoint: ChartPoint | null;
  baseCurrency: string;
  pairLabel: string;
}

export function FXRatesHero({
  selectedPair,
  selectedPeriod,
  onSelectPair,
  onSelectPeriod,
  loading,
  summary,
  activePoint,
  baseCurrency,
  pairLabel,
}: FXRatesHeroProps) {
  return (
    <>
      {/* Currency Pair Selector Chips */}
      <View style={styles.pairSelectorContainer}>
        {PAIR_OPTIONS.map((item) => {
          const isSelected = selectedPair === item.pair;
          return (
            <TouchableOpacity
              key={item.pair}
              style={[
                styles.pairChip,
                isSelected ? styles.pairChipSelected : styles.pairChipUnselected,
              ]}
              onPress={() => onSelectPair(item.pair)}
              activeOpacity={0.8}
            >
              <Text
                variant="label"
                color={isSelected ? colors.textInverse : colors.ink}
                style={{ fontWeight: isSelected ? '700' : '600' }}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Rate Display Hero */}
      {loading ? (
        <View style={styles.heroSkeleton}>
          <Skeleton width={120} height={20} style={{ marginBottom: 8 }} />
          <Skeleton width={200} height={40} style={{ marginBottom: 8 }} />
          <Skeleton width={160} height={18} />
        </View>
      ) : summary ? (
        <View style={styles.rateHero}>
          <Text variant="caption" color={colors.textSecondary}>
            {pairLabel} Indicative Rate
          </Text>
          <View style={styles.rateRow}>
            <Text variant="display" color={colors.ink} style={styles.rateValue}>
              ₱
              {formatFXRate(
                activePoint ? activePoint.rate : summary.latestRate,
                baseCurrency
              )}
            </Text>
            {summary.direction !== 'flat' && (
              <Badge
                label={formatFXChange(summary.changeValue, summary.changePercent)}
                variant={summary.direction === 'up' ? 'success' : 'danger'}
                icon={
                  summary.direction === 'up' ? (
                    <TrendingUp size={12} color={colors.green} />
                  ) : (
                    <TrendingDown size={12} color={colors.red} />
                  )
                }
                style={{ marginLeft: spacing.sm }}
              />
            )}
          </View>

          <Text variant="caption" color={colors.textMuted}>
            {activePoint
              ? `Selected: ${activePoint.date}`
              : `ECB Rate Date: ${summary.rateDate}`}
          </Text>
        </View>
      ) : (
        <EmptyState
          title="No Rate Data Available"
          description="European Central Bank reference rates could not be retrieved at this time."
          icon={<Globe size={40} color={colors.textMuted} />}
        />
      )}

      {/* Period Chips (1W, 1M, 3M, 1Y) — strictly NO 1D */}
      <View style={styles.periodRow}>
        {PERIOD_OPTIONS.map((item) => {
          const isSelected = selectedPeriod === item.period;
          return (
            <TouchableOpacity
              key={item.period}
              style={[
                styles.periodChip,
                isSelected ? styles.periodChipSelected : styles.periodChipUnselected,
              ]}
              onPress={() => onSelectPeriod(item.period)}
              activeOpacity={0.8}
            >
              <Text
                variant="label"
                color={isSelected ? colors.primary : colors.textSecondary}
                style={{ fontWeight: isSelected ? '700' : '500' }}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Note explaining no 1D intraday view (§E.2) */}
      <Text variant="caption" color={colors.textMuted} style={styles.intradayNote}>
        No 1D view: ECB reference rates are published once daily on business days.
        Intraday rates are not provided.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  pairSelectorContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  pairChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pairChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pairChipUnselected: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  heroSkeleton: {
    paddingVertical: spacing.md,
  },
  rateHero: {
    marginBottom: spacing.lg,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  rateValue: {
    fontSize: 32,
    fontWeight: '800',
  },
  periodRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  periodChip: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  periodChipSelected: {
    backgroundColor: colors.primaryTint,
    borderColor: colors.primary,
  },
  periodChipUnselected: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  intradayNote: {
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: spacing.md,
  },
});
