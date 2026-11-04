import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Modal, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { X, Info, AlertCircle, Globe } from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  type FXRate,
  type FXPair,
  type FXPeriod,
  filterRatesByPeriod,
  calculateFXSummary,
  getVoiceOverSummary,
} from '@davao-bank/shared';
import { Text } from '../components/Text';
import { Card } from '../components/Card';
import { PrivacyOverlay } from '../components/PrivacyOverlay';
import { supabase } from '../lib/supabase';
import {
  FXRatesChart,
  CHART_WIDTH,
  CHART_HEIGHT,
  CHART_PADDING,
  type ChartData,
} from './fx/FXRatesChart';
import { FXRatesHistory } from './fx/FXRatesHistory';
import { FXRatesHero, PAIR_OPTIONS } from './fx/FXRatesHero';

interface FXRatesModalProps {
  visible: boolean;
  onClose: () => void;
  initialPair?: FXPair;
}

export function FXRatesModal({
  visible,
  onClose,
  initialPair = 'USD/PHP',
}: FXRatesModalProps) {
  const [selectedPair, setSelectedPair] = useState<FXPair>(initialPair);
  const [selectedPeriod, setSelectedPeriod] = useState<FXPeriod>('1M');
  const [allRates, setAllRates] = useState<FXRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCachedData, setIsCachedData] = useState(false);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  const currentPairMeta = useMemo(() => {
    return PAIR_OPTIONS.find((p) => p.pair === selectedPair) || PAIR_OPTIONS[0];
  }, [selectedPair]);

  const loadFXRates = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('fx_rates')
        .select('*')
        .eq('base', currentPairMeta.base)
        .eq('quote', 'PHP')
        .order('rate_date', { ascending: true });

      if (error) {
        console.warn('Failed to load fx rates from Supabase:', error.message);
        setIsCachedData(true);
      } else if (data && data.length > 0) {
        setAllRates(data as FXRate[]);
        setIsCachedData(false);
      } else {
        setAllRates([]);
      }
    } catch (err) {
      console.warn('Error fetching FX rates:', err);
      setIsCachedData(true);
    } finally {
      setLoading(false);
    }
  }, [currentPairMeta.base]);

  useEffect(() => {
    if (visible) {
      setScrubIndex(null);
      loadFXRates();
    }
  }, [visible, selectedPair, loadFXRates]);

  const periodRates = useMemo(() => {
    return filterRatesByPeriod(allRates, selectedPeriod);
  }, [allRates, selectedPeriod]);

  const summary = useMemo(() => {
    return calculateFXSummary(allRates);
  }, [allRates]);

  const voiceOverSummary = useMemo(() => {
    return getVoiceOverSummary(currentPairMeta.base, 'PHP', selectedPeriod, periodRates);
  }, [currentPairMeta.base, selectedPeriod, periodRates]);

  const chartData = useMemo<ChartData | null>(() => {
    if (!periodRates || periodRates.length === 0) return null;

    const values = periodRates.map((r) => Number(r.rate));
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 0.0001;

    const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
    const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

    const points = periodRates.map((r, i) => {
      const x = CHART_PADDING.left + (i / (periodRates.length - 1 || 1)) * plotWidth;
      const normalizedY = (Number(r.rate) - minVal) / range;
      const y = CHART_PADDING.top + (1 - normalizedY) * plotHeight;
      return { x, y, rate: Number(r.rate), date: r.rate_date };
    });

    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      linePath += ` L ${points[i].x} ${points[i].y}`;
    }

    const areaBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${areaBottom} L ${points[0].x} ${areaBottom} Z`;

    return {
      points,
      linePath,
      areaPath,
      minVal,
      maxVal,
      firstDate: periodRates[0].rate_date,
      lastDate: periodRates[periodRates.length - 1].rate_date,
    };
  }, [periodRates]);

  const activePoint =
    scrubIndex !== null && chartData && chartData.points[scrubIndex]
      ? chartData.points[scrubIndex]
      : chartData && chartData.points.length > 0
        ? chartData.points[chartData.points.length - 1]
        : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Globe size={22} color={colors.primary} />
            <Text variant="title" color={colors.ink} style={{ marginLeft: spacing.sm }}>
              FX Reference Rates
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            accessibilityLabel="Close reference rates modal"
          >
            <X size={20} color={colors.ink} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Disclaimer Banner (§E.2) */}
          <Card variant="default" style={styles.disclaimerCard}>
            <View style={styles.disclaimerRow}>
              <Info size={18} color={colors.primary} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text variant="bodyStrong" color={colors.ink}>
                  Reference rate — not a Davao Bank rate.
                </Text>
                <Text
                  variant="caption"
                  color={colors.textSecondary}
                  style={{ marginTop: 2 }}
                >
                  Indicative reference rates only. Davao Bank does not offer foreign
                  exchange trading or currency conversion.
                </Text>
                <Text variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
                  Source: ECB reference rates via Frankfurter · updated{' '}
                  {summary?.rateDate || 'daily on business days'}
                </Text>
              </View>
            </View>
          </Card>

          {/* Cached Data Warning if offline/error */}
          {isCachedData && (
            <View style={styles.cachedNotice}>
              <AlertCircle size={16} color={colors.orangeText} />
              <Text
                variant="caption"
                color={colors.orangeText}
                style={{ marginLeft: spacing.xs, flex: 1 }}
              >
                Live updates unavailable. Displaying last cached ECB reference rates.
              </Text>
            </View>
          )}

          {/* Pair Selector, Hero Rate Display, Period Selector */}
          <FXRatesHero
            selectedPair={selectedPair}
            selectedPeriod={selectedPeriod}
            onSelectPair={(pair) => {
              setSelectedPair(pair);
              setScrubIndex(null);
            }}
            onSelectPeriod={(period) => {
              setSelectedPeriod(period);
              setScrubIndex(null);
            }}
            loading={loading}
            summary={summary}
            activePoint={activePoint}
            baseCurrency={currentPairMeta.base}
            pairLabel={currentPairMeta.label}
          />

          {/* SVG Line Chart Container */}
          <FXRatesChart
            loading={loading}
            chartData={chartData}
            activePoint={activePoint}
            baseCurrency={currentPairMeta.base}
            voiceOverSummary={voiceOverSummary}
            onScrub={setScrubIndex}
          />

          {/* Holiday and weekend note (§E.2) */}
          <View style={styles.calendarNoticeRow}>
            <Info size={14} color={colors.textMuted} />
            <Text
              variant="caption"
              color={colors.textMuted}
              style={{ marginLeft: 6, flex: 1 }}
            >
              Weekends and bank holidays are skipped by the ECB. Gaps between business
              days are normal.
            </Text>
          </View>

          {/* Recent Daily Rates Table */}
          <FXRatesHistory rates={periodRates} baseCurrency={currentPairMeta.base} />
        </ScrollView>
        <PrivacyOverlay />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    padding: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSubtle,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  disclaimerCard: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cachedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tintOrange,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  calendarNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
});
