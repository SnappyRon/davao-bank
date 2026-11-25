import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, ScrollView, type ScrollViewInstance, StyleSheet } from 'react-native';
import { Info, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import {
  colors,
  radius,
  size,
  spacing,
  toUserMessage,
  type FXRate,
  type FXPair,
  type FXPeriod,
  filterRatesByPeriod,
  calculateFXSummary,
  getVoiceOverSummary,
  isFxRateStale,
} from '@davao-bank/shared';
import type { RootStackParamList } from '../../App';
import { Text } from '../components/Text';
import { Card } from '../components/Card';
import { FeatureScreen } from '../components/FeatureScreen';
import { EmptyState } from '../components/EmptyState';
import { Pressable } from '../components/Pressable';
import { Button } from '../components/Button';
import { supabase } from '../lib/supabase';
import { reportNetworkResult } from '../lib/networkStatus';
import { MASCOT_ERROR } from '../assets/illustrations';
import {
  FXRatesChart,
  CHART_WIDTH,
  CHART_HEIGHT,
  CHART_PADDING,
  type ChartData,
} from './fx/FXRatesChart';
import { FXRatesHistory } from './fx/FXRatesHistory';
import { FXRatesHero, PAIR_OPTIONS } from './fx/FXRatesHero';
import { FXConverter, type FXConverterRef } from './fx/FXConverter';

export function FXRatesScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'FXRates'>>();
  const [selectedPair, setSelectedPair] = useState<FXPair>('USD/PHP');
  const [selectedPeriod, setSelectedPeriod] = useState<FXPeriod>('1M');
  const [allRates, setAllRates] = useState<FXRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCachedData, setIsCachedData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [converterOpen, setConverterOpen] = useState(route.params?.mode === 'convert');

  const converterRef = useRef<FXConverterRef>(null);
  const scrollViewRef = useRef<any>(null);

  /** Open the converter, scroll it into view and focus the amount input. */
  const revealConverter = useCallback(() => {
    setConverterOpen(true);
    setTimeout(() => {
      converterRef.current?.focus();
      scrollViewRef.current?.scrollToOffset?.({
        y: 1000000,
        animated: true,
      });
    }, 0);
  }, []);

  useEffect(() => {
    if (converterOpen) {
      revealConverter();
    }
  }, [converterOpen, revealConverter]);

  const requestIdRef = useRef(0);

  const currentPairMeta = useMemo(() => {
    return PAIR_OPTIONS.find((p) => p.pair === selectedPair) || PAIR_OPTIONS[0];
  }, [selectedPair]);

  const loadFXRates = useCallback(async () => {
    const currentRequestId = ++requestIdRef.current;
    try {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await supabase
        .from('fx_rates')
        .select('*')
        .eq('base', currentPairMeta.base)
        .eq('quote', 'PHP')
        .order('rate_date', { ascending: true });

      reportNetworkResult(error);
      if (requestIdRef.current !== currentRequestId) return;

      if (error) {
        console.warn('Failed to load fx rates from Supabase:', error.message);
        setAllRates([]);
        setIsCachedData(false);
        setLoadError(toUserMessage(error, 'load'));
      } else if (data && data.length > 0) {
        setAllRates(data as FXRate[]);
        setIsCachedData(false);
        setLoadError(null);
      } else {
        setAllRates([]);
        setIsCachedData(false);
        setLoadError(null);
      }
    } catch (err: unknown) {
      reportNetworkResult(err);
      if (requestIdRef.current !== currentRequestId) return;
      console.warn('Error fetching FX rates:', err);
      setAllRates([]);
      setIsCachedData(false);
      setLoadError(toUserMessage(err, 'load'));
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoading(false);
      }
    }
  }, [currentPairMeta.base]);

  useEffect(() => {
    setScrubIndex(null);
    loadFXRates();
  }, [selectedPair, loadFXRates]);

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
    <FeatureScreen
      title="FX reference rates"
      contentContainerStyle={styles.scrollContent}
      scrollViewRef={scrollViewRef}
    >
      {/* Disclaimer Banner (§E.2) */}
      <Card variant="default" style={styles.disclaimerCard}>
        <View style={styles.disclaimerRow}>
          <Info size={18} color={colors.primary} style={styles.disclaimerIcon} />
          <View style={styles.disclaimerContent}>
            <Text variant="bodyStrong" color={colors.ink}>
              Reference rate — not a Davao Bank rate.
            </Text>
            <Text
              variant="caption"
              color={colors.textSecondary}
              style={styles.disclaimerSubtext}
            >
              Indicative reference rates only. Davao Bank does not offer foreign exchange
              trading or currency conversion.
            </Text>
            <Text
              variant="caption"
              color={colors.textMuted}
              style={styles.disclaimerSource}
            >
              Source: ECB reference rates via Frankfurter · updated{' '}
              {summary?.rateDate || 'daily on business days'}
            </Text>
          </View>
        </View>
      </Card>

      {/* Convert action: scrolls to and focuses the converter */}
      <Pressable
        onPress={revealConverter}
        accessibilityRole="button"
        accessibilityLabel="Open FX converter"
        style={styles.convertAction}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text variant="bodyStrong" color={colors.primary} style={styles.convertLabel}>
          Convert
        </Text>
      </Pressable>

      {/* Cached Data Warning if offline/error and cached data displayed */}
      {isCachedData && allRates.length > 0 && (
        <View style={styles.cachedNotice}>
          <AlertCircle size={16} color={colors.orangeText} />
          <Text
            variant="caption"
            color={colors.orangeText}
            style={styles.cachedNoticeText}
          >
            Live updates unavailable. Displaying last cached ECB reference rates.
          </Text>
        </View>
      )}

      {/* Error state with Try again button */}
      {loadError && !loading && allRates.length === 0 ? (
        <EmptyState
          title="Reference rates unavailable"
          description={loadError}
          descriptionAccessibilityRole="alert"
          illustration={MASCOT_ERROR}
          illustrationTestID="fx-error-mascot"
          actionTitle="Try again"
          onAction={() => void loadFXRates()}
          scrollable={false}
        />
      ) : (
        <>
          {loadError ? (
            <View style={styles.errorContainer}>
              <View style={styles.errorRow}>
                <AlertCircle size={16} color={colors.redText} />
                <Text
                  variant="caption"
                  color={colors.redText}
                  accessibilityRole="alert"
                  style={styles.errorText}
                >
                  {loadError}
                </Text>
              </View>
              <Button
                title="Try again"
                variant="secondary"
                onPress={() => void loadFXRates()}
              />
            </View>
          ) : null}

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
              style={styles.calendarNoticeText}
            >
              Weekends and bank holidays are skipped by the ECB. Gaps between business
              days are normal.
            </Text>
          </View>

          {/* Recent Daily Rates Table */}
          <FXRatesHistory rates={periodRates} baseCurrency={currentPairMeta.base} />

          {/* FX Converter section (§4.1): ₱ ↔ the quoted currencies, view-only simulation */}
          <Pressable
            onPress={() => setConverterOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={converterOpen ? 'Hide FX converter' : 'Show FX converter'}
            style={styles.converterToggle}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={styles.converterToggleRow}>
              <Text
                variant="bodyStrong"
                color={colors.ink}
                style={styles.converterToggleText}
                maxFontSizeMultiplier={1.4}
              >
                {converterOpen ? 'Hide converter' : 'FX converter'}
              </Text>
              {converterOpen ? (
                <ChevronUp size={18} color={colors.textMuted} />
              ) : (
                <ChevronDown size={18} color={colors.textMuted} />
              )}
            </View>
          </Pressable>
          {converterOpen && (
            <FXConverter
              ref={converterRef}
              pair={selectedPair}
              rate={summary?.latestRate ?? null}
              rateDate={summary?.rateDate ?? null}
              stale={summary?.rateDate ? isFxRateStale(summary.rateDate) : false}
              loading={loading}
            />
          )}
        </>
      )}
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
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
  disclaimerIcon: {
    marginTop: spacing.xs,
  },
  disclaimerContent: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  disclaimerSubtext: {
    marginTop: spacing.xs,
  },
  disclaimerSource: {
    marginTop: spacing.xs,
  },
  cachedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tintOrange,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  cachedNoticeText: {
    marginLeft: spacing.xs,
    flex: 1,
  },
  errorContainer: {
    gap: spacing.sm,
    backgroundColor: colors.tintRed,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    flex: 1,
  },
  calendarNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  calendarNoticeText: {
    marginLeft: spacing.xs,
    flex: 1,
  },
  converterToggle: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  converterToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: size.touch,
    minWidth: size.touch,
  },
  converterToggleText: {
    marginRight: spacing.sm,
  },
  convertAction: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  convertLabel: {
    color: colors.primary,
  },
});
