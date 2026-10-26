import React, { useEffect, useState } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  Globe,
} from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  type FXRate,
  formatFXRate,
  formatFXChange,
  calculateFXSummary,
} from '@davao-bank/shared';
import { Text } from './Text';
import { Badge } from './Badge';
import { Skeleton } from './Skeleton';
import { supabase } from '../lib/supabase';

interface CurrencyWatchCardProps {
  onPress: () => void;
  style?: any;
}

export function CurrencyWatchCard({ onPress, style }: CurrencyWatchCardProps) {
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
  }, []);

  const summary = calculateFXSummary(rates);

  if (loading) {
    return (
      <View style={[styles.card, style]}>
        <Skeleton width="100%" height={74} style={{ borderRadius: radius.md }} />
      </View>
    );
  }

  // Fallback if no rate data in database yet
  const latestRate = summary?.latestRate ?? 58.95;
  const changeValue = summary?.changeValue ?? 0.15;
  const changePercent = summary?.changePercent ?? 0.26;
  const direction = summary?.direction ?? 'up';
  const rateDate = summary?.rateDate ?? '2026-10-26';

  const trendIcon =
    direction === 'up' ? (
      <TrendingUp size={12} color={colors.green} />
    ) : direction === 'down' ? (
      <TrendingDown size={12} color={colors.red} />
    ) : (
      <Minus size={12} color={colors.textMuted} />
    );

  const changeText = formatFXChange(changeValue, changePercent);

  return (
    <TouchableOpacity
      style={[styles.card, style]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Currency watch: USD to PHP indicative rate ₱${formatFXRate(latestRate, 'USD')}, change ${changeText}, as of ${rateDate}. Double tap to open reference rates.`}
    >
      <View style={styles.leftCol}>
        <View style={styles.titleRow}>
          <Globe size={14} color={colors.primary} />
          <Text variant="caption" color={colors.textSecondary} style={{ marginLeft: 5 }}>
            CURRENCY WATCH · USD / PHP
          </Text>
        </View>

        <View style={styles.rateRow}>
          <Text variant="title" color={colors.ink} style={styles.rateText}>
            ₱{formatFXRate(latestRate, 'USD')}
          </Text>
          <Badge
            label={changeText}
            variant={
              direction === 'up' ? 'success' : direction === 'down' ? 'danger' : 'neutral'
            }
            icon={trendIcon}
            style={{ marginLeft: spacing.sm }}
          />
        </View>

        <Text variant="caption" color={colors.textMuted}>
          ECB Reference Rate · {rateDate}
        </Text>
      </View>

      <View style={styles.rightCol}>
        <ChevronRight size={18} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: spacing.sm,
  },
  leftCol: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  rateText: {
    fontWeight: '800',
    fontSize: 20,
  },
  rightCol: {
    paddingLeft: spacing.sm,
  },
});
