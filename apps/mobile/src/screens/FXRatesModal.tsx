import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  PanResponder,
  type GestureResponderEvent,
} from 'react-native';
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Line,
  Circle,
  Text as SvgText,
} from 'react-native-svg';
import {
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  AlertCircle,
  Globe,
  RefreshCw,
} from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  type FXRate,
  type FXPair,
  type FXPeriod,
  formatFXRate,
  formatFXChange,
  filterRatesByPeriod,
  calculateFXSummary,
  getVoiceOverSummary,
} from '@davao-bank/shared';
import { Text } from '../components/Text';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { supabase } from '../lib/supabase';

interface FXRatesModalProps {
  visible: boolean;
  onClose: () => void;
  initialPair?: FXPair;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - spacing['2xl'] * 2;
const CHART_HEIGHT = 180;
const CHART_PADDING = { top: 20, right: 15, bottom: 25, left: 15 };

const PAIR_OPTIONS: { pair: FXPair; base: string; label: string }[] = [
  { pair: 'USD/PHP', base: 'USD', label: 'USD / PHP' },
  { pair: 'EUR/PHP', base: 'EUR', label: 'EUR / PHP' },
  { pair: 'JPY/PHP', base: 'JPY', label: 'JPY / PHP' },
];

const PERIOD_OPTIONS: { period: FXPeriod; label: string }[] = [
  { period: '1W', label: '1W' },
  { period: '1M', label: '1M' },
  { period: '3M', label: '3M' },
  { period: '1Y', label: '1Y' },
];

export function FXRatesModal({
  visible,
  onClose,
  initialPair = 'USD/PHP',
}: FXRatesModalProps) {
  const [selectedPair, setSelectedPair] = useState<FXPair>(initialPair);
  const [selectedPeriod, setSelectedPeriod] = useState<FXPeriod>('1M');
  const [allRates, setAllRates] = useState<FXRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
      setRefreshing(false);
    }
  }, [currentPairMeta.base]);

  useEffect(() => {
    if (visible) {
      setScrubIndex(null);
      loadFXRates();
    }
  }, [visible, selectedPair, loadFXRates]);

  // Filter rates for the selected period
  const periodRates = useMemo(() => {
    return filterRatesByPeriod(allRates, selectedPeriod);
  }, [allRates, selectedPeriod]);

  // Calculate rate summary (latest, 24h change, direction)
  const summary = useMemo(() => {
    return calculateFXSummary(allRates);
  }, [allRates]);

  // Screen reader accessibility label
  const voiceOverSummary = useMemo(() => {
    return getVoiceOverSummary(currentPairMeta.base, 'PHP', selectedPeriod, periodRates);
  }, [currentPairMeta.base, selectedPeriod, periodRates]);

  // Chart coordinates calculation
  const chartData = useMemo(() => {
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

    // Build SVG Path
    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      linePath += ` L ${points[i].x} ${points[i].y}`;
    }

    // Build Closed Area Path for gradient fill
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

  // Pan Responder for interactive scrubbing
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          handleTouch(evt.nativeEvent.locationX);
        },
        onPanResponderMove: (evt: GestureResponderEvent) => {
          handleTouch(evt.nativeEvent.locationX);
        },
        onPanResponderRelease: () => {
          // Keep active scrubber point for reading
        },
      }),
    [chartData]
  );

  const handleTouch = (touchX: number) => {
    if (!chartData || chartData.points.length === 0) return;
    let closestIndex = 0;
    let closestDist = Infinity;
    chartData.points.forEach((pt, idx) => {
      const dist = Math.abs(pt.x - touchX);
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = idx;
      }
    });
    setScrubIndex(closestIndex);
  };

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
          {/* Always Visible Disclaimer Banner (§E.2) */}
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
                  onPress={() => {
                    setSelectedPair(item.pair);
                    setScrubIndex(null);
                  }}
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
                {currentPairMeta.label} Indicative Rate
              </Text>
              <View style={styles.rateRow}>
                <Text variant="display" color={colors.ink} style={styles.rateValue}>
                  ₱
                  {formatFXRate(
                    activePoint ? activePoint.rate : summary.latestRate,
                    currentPairMeta.base
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
                  onPress={() => {
                    setSelectedPeriod(item.period);
                    setScrubIndex(null);
                  }}
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

          {/* SVG Line Chart Container */}
          <View
            style={styles.chartCard}
            accessible={true}
            accessibilityRole="image"
            accessibilityLabel={voiceOverSummary}
          >
            {loading ? (
              <View style={styles.chartLoading}>
                <Skeleton width="100%" height={CHART_HEIGHT} />
              </View>
            ) : chartData && chartData.points.length > 0 ? (
              <View {...panResponder.panHandlers}>
                <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                  <Defs>
                    <LinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.25" />
                      <Stop offset="100%" stopColor={colors.primary} stopOpacity="0.0" />
                    </LinearGradient>
                  </Defs>

                  {/* Min / Max reference grid lines */}
                  <Line
                    x1={CHART_PADDING.left}
                    y1={CHART_PADDING.top}
                    x2={CHART_WIDTH - CHART_PADDING.right}
                    y2={CHART_PADDING.top}
                    stroke={colors.border}
                    strokeDasharray="4, 4"
                    strokeWidth="1"
                  />
                  <Line
                    x1={CHART_PADDING.left}
                    y1={CHART_HEIGHT - CHART_PADDING.bottom}
                    x2={CHART_WIDTH - CHART_PADDING.right}
                    y2={CHART_HEIGHT - CHART_PADDING.bottom}
                    stroke={colors.border}
                    strokeDasharray="4, 4"
                    strokeWidth="1"
                  />

                  {/* Area Gradient Fill */}
                  <Path d={chartData.areaPath} fill="url(#chartGradient)" />

                  {/* Main Line Stroke */}
                  <Path
                    d={chartData.linePath}
                    fill="none"
                    stroke={colors.primary}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Active Scrubber Point Marker */}
                  {activePoint && (
                    <>
                      <Line
                        x1={activePoint.x}
                        y1={CHART_PADDING.top}
                        x2={activePoint.x}
                        y2={CHART_HEIGHT - CHART_PADDING.bottom}
                        stroke={colors.primary}
                        strokeDasharray="2, 2"
                        strokeWidth="1.5"
                      />
                      <Circle
                        cx={activePoint.x}
                        cy={activePoint.y}
                        r="5"
                        fill={colors.surface}
                        stroke={colors.primary}
                        strokeWidth="3"
                      />
                    </>
                  )}

                  {/* Y-Axis Value Labels */}
                  <SvgText
                    x={CHART_WIDTH - CHART_PADDING.right}
                    y={CHART_PADDING.top - 5}
                    textAnchor="end"
                    fontSize="11"
                    fontWeight="600"
                    fill={colors.textSecondary}
                  >
                    ₱{formatFXRate(chartData.maxVal, currentPairMeta.base)}
                  </SvgText>
                  <SvgText
                    x={CHART_WIDTH - CHART_PADDING.right}
                    y={CHART_HEIGHT - 6}
                    textAnchor="end"
                    fontSize="11"
                    fontWeight="600"
                    fill={colors.textMuted}
                  >
                    ₱{formatFXRate(chartData.minVal, currentPairMeta.base)}
                  </SvgText>

                  {/* X-Axis Date Range Labels */}
                  <SvgText
                    x={CHART_PADDING.left}
                    y={CHART_HEIGHT - 6}
                    textAnchor="start"
                    fontSize="11"
                    fontWeight="500"
                    fill={colors.textMuted}
                  >
                    {chartData.firstDate}
                  </SvgText>
                </Svg>
              </View>
            ) : (
              <View style={styles.chartEmpty}>
                <Text variant="caption" color={colors.textMuted}>
                  No historical points for this period.
                </Text>
              </View>
            )}
          </View>

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
          <View style={styles.historySection}>
            <Text
              variant="bodyStrong"
              color={colors.ink}
              style={{ marginBottom: spacing.sm }}
            >
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

              {periodRates
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
                      ₱{formatFXRate(Number(r.rate), currentPairMeta.base)}
                    </Text>
                  </View>
                ))}
            </View>
          </View>
        </ScrollView>
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
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    overflow: 'hidden',
  },
  chartLoading: {
    height: CHART_HEIGHT,
    justifyContent: 'center',
  },
  chartEmpty: {
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
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
