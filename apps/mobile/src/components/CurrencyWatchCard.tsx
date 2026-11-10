import React, { useEffect, useState } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { TrendingUp, TrendingDown, Minus, ChevronRight } from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  type FXRate,
  formatFXChange,
  calculateFXSummary,
} from '@davao-bank/shared';
import { Text } from './Text';
import { Badge } from './Badge';
import { Skeleton } from './Skeleton';
import { Pressable } from './Pressable';
import { supabase } from '../lib/supabase';

/** Spec 7B.1: one row, 64 pt tall. */
const ROW_MIN_HEIGHT = 64;
const TREND_ICON_SIZE = 12;
const CHEVRON_SIZE = 18;
/** A rate older than this many days reads "Not updated since …". */
const STALE_AFTER_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "2026-10-26" → local midnight of that calendar day, or null if malformed. */
function parseDateOnly(isoDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

/** "2026-10-26" → "Oct 26". */
export function formatShortDate(isoDate: string): string {
  const date = parseDateOnly(isoDate);
  if (!date) return isoDate;
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** True when the rate date is more than 3 calendar days before `now`. */
export function isRateStale(isoDate: string, now: Date = new Date()): boolean {
  const date = parseDateOnly(isoDate);
  if (!date) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ageDays = Math.round((today.getTime() - date.getTime()) / MS_PER_DAY);
  return ageDays > STALE_AFTER_DAYS;
}

function formatPercentChange(percent: number): string {
  const sign = percent > 0 ? '+' : percent < 0 ? '−' : '±';
  return `${sign}${Math.abs(percent).toFixed(2)}%`;
}

interface CurrencyWatchCardProps {
  onPress: () => void;
  /** Change it to refetch (Home bumps it on pull-to-refresh and focus). */
  refreshKey?: number;
  style?: StyleProp<ViewStyle>;
}

export function CurrencyWatchCard({
  onPress,
  refreshKey = 0,
  style,
}: CurrencyWatchCardProps) {
  const [rates, setRates] = useState<FXRate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchUSDRate() {
      try {
        const { data, error } = await supabase
          .from('fx_rates')
          .select('*')
          .eq('base', 'USD')
          .eq('quote', 'PHP')
          .order('rate_date', { ascending: false })
          .limit(5);

        if (!error && data && data.length > 0 && isMounted) {
          // Reverse so oldest is first for calculateFXSummary
          setRates((data as FXRate[]).reverse());
        }
      } catch (err) {
        console.warn('CurrencyWatchCard fetch error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchUSDRate();

    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  if (loading) {
    return (
      <View style={style}>
        <Skeleton width="100%" height={ROW_MIN_HEIGHT} style={styles.skeleton} />
      </View>
    );
  }

  const summary = calculateFXSummary(rates);

  // No rate yet: say so instead of showing a made-up number.
  if (!summary) {
    return (
      <Pressable
        style={[styles.row, style]}
        onPress={onPress}
        feedbackType="scale"
        accessibilityRole="button"
        accessibilityLabel="Currency watch: USD to PHP rate unavailable. Open reference rates"
      >
        <View style={styles.textCol}>
          <Text variant="bodyStrong" color={colors.ink}>
            USD/PHP
          </Text>
          <Text variant="caption" color={colors.textMuted}>
            Rate unavailable
          </Text>
        </View>
        <ChevronRight size={CHEVRON_SIZE} color={colors.textMuted} />
      </Pressable>
    );
  }

  const { latestRate, changeValue, changePercent, direction, rateDate } = summary;
  const rateText = `₱${latestRate.toFixed(2)}`;
  const shortDate = formatShortDate(rateDate);
  const stale = isRateStale(rateDate);
  const dateText = stale ? `Not updated since ${shortDate}` : shortDate;

  const trendIcon =
    direction === 'up' ? (
      <TrendingUp size={TREND_ICON_SIZE} color={colors.primary} />
    ) : direction === 'down' ? (
      <TrendingDown size={TREND_ICON_SIZE} color={colors.redText} />
    ) : (
      <Minus size={TREND_ICON_SIZE} color={colors.textSecondary} />
    );

  return (
    <Pressable
      style={[styles.row, style]}
      onPress={onPress}
      feedbackType="scale"
      accessibilityRole="button"
      accessibilityLabel={`Currency watch: USD/PHP ${rateText}, change ${formatFXChange(changeValue, changePercent)}. ${dateText}. Open reference rates`}
    >
      <View style={styles.textCol}>
        <View style={styles.rateLine}>
          <Text
            variant="bodyStrong"
            color={colors.ink}
            tabularNums
            maxFontSizeMultiplier={1.4}
          >
            USD/PHP {rateText}
          </Text>
          <Badge
            label={formatPercentChange(changePercent)}
            variant={
              direction === 'up' ? 'success' : direction === 'down' ? 'danger' : 'neutral'
            }
            icon={trendIcon}
          />
        </View>
        <Text variant="caption" color={colors.textMuted}>
          {dateText}
        </Text>
      </View>
      <ChevronRight size={CHEVRON_SIZE} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    borderRadius: radius.md,
  },
  row: {
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textCol: {
    flex: 1,
    gap: spacing.xs,
  },
  rateLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
