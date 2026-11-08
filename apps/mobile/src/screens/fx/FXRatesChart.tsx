import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
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
import { colors, radius, spacing, formatFXRate, typography } from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { Skeleton } from '../../components/Skeleton';

const SCREEN_WIDTH = Dimensions.get('window').width;
export const CHART_WIDTH = SCREEN_WIDTH - spacing['2xl'] * 2;
export const CHART_HEIGHT = 180;
export const CHART_PADDING = { top: 20, right: 15, bottom: 25, left: 15 };

export interface ChartPoint {
  x: number;
  y: number;
  rate: number;
  date: string;
}

export interface ChartData {
  points: ChartPoint[];
  linePath: string;
  areaPath: string;
  minVal: number;
  maxVal: number;
  firstDate: string;
  lastDate: string;
}

interface FXRatesChartProps {
  loading: boolean;
  chartData: ChartData | null;
  activePoint: ChartPoint | null;
  baseCurrency: string;
  voiceOverSummary: string;
  onScrub: (index: number) => void;
}

export function FXRatesChart({
  loading,
  chartData,
  activePoint,
  baseCurrency,
  voiceOverSummary,
  onScrub,
}: FXRatesChartProps) {
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
    onScrub(closestIndex);
  };

  return (
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
              style={{ fontWeight: typography.bodyStrong.fontWeight }}
              fill={colors.textSecondary}
            >
              ₱{formatFXRate(chartData.maxVal, baseCurrency)}
            </SvgText>
            <SvgText
              x={CHART_WIDTH - CHART_PADDING.right}
              y={CHART_HEIGHT - 6}
              textAnchor="end"
              fontSize="11"
              style={{ fontWeight: typography.bodyStrong.fontWeight }}
              fill={colors.textMuted}
            >
              ₱{formatFXRate(chartData.minVal, baseCurrency)}
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
  );
}

const styles = StyleSheet.create({
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
});
