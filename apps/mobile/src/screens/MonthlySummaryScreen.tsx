import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  ChevronLeft,
  ChevronRight,
  ArrowDownLeft,
  Send,
  Zap,
  MinusCircle,
  SlidersHorizontal,
  AlertCircle,
  BarChart3,
} from 'lucide-react-native';
import { colors, radius, size, spacing } from '@davao-bank/shared';
import { useSettings } from '../context/SettingsContext';
import {
  fetchMonthlySummary,
  phase8UserMessage,
  type MonthlySummaryCategory,
  type MonthlySummaryRow,
} from '../hooks/usePhase8Contracts';
import {
  FeatureScreen,
  Text,
  Card,
  AmountText,
  EmptyState,
  Skeleton,
  Pressable,
  GroupedList,
  ListHairline,
  groupedListStyles,
  LIST_ICON_SIZE,
} from '../components';

const BAR_HEIGHT = 8;
const SKELETON_OVERVIEW_HEIGHT = 104;
const SKELETON_LIST_HEIGHT = 280;
const CHEVRON_SIZE = 20;

const CATEGORY_ORDER: MonthlySummaryCategory[] = [
  'money_in',
  'transfers_out',
  'bills',
  'cash_out',
  'adjustments',
];

const CATEGORY_META: Record<
  MonthlySummaryCategory,
  {
    label: string;
    barColor: string;
    discBg: string;
    renderIcon: () => React.ReactNode;
  }
> = {
  money_in: {
    label: 'Money in',
    barColor: colors.primary,
    discBg: colors.primaryTint,
    renderIcon: () => <ArrowDownLeft size={LIST_ICON_SIZE} color={colors.primary} />,
  },
  transfers_out: {
    label: 'Transfers out',
    barColor: colors.blue,
    discBg: colors.tintBlue,
    renderIcon: () => <Send size={LIST_ICON_SIZE} color={colors.blueText} />,
  },
  bills: {
    label: 'Bills',
    barColor: colors.orange,
    discBg: colors.tintOrange,
    renderIcon: () => <Zap size={LIST_ICON_SIZE} color={colors.orangeText} />,
  },
  cash_out: {
    label: 'Cash out',
    barColor: colors.red,
    discBg: colors.tintRed,
    renderIcon: () => <MinusCircle size={LIST_ICON_SIZE} color={colors.redText} />,
  },
  adjustments: {
    label: 'Bank adjustments',
    barColor: colors.yellow,
    discBg: colors.tintYellow,
    renderIcon: () => <SlidersHorizontal size={LIST_ICON_SIZE} color={colors.ink} />,
  },
};

export function formatMonthIso(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
}

export function formatMonthTitle(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export function shiftMonth(
  current: { year: number; month: number },
  delta: number
): { year: number; month: number } {
  const d = new Date(current.year, current.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function MonthlySummaryScreen() {
  const { hideBalance } = useSettings();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const [selected, setSelected] = useState(() => ({
    year: currentYear,
    month: currentMonth,
  }));
  const [rows, setRows] = useState<MonthlySummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadSeqRef = useRef(0);

  const isCurrentMonth = selected.year === currentYear && selected.month === currentMonth;
  const monthIso = formatMonthIso(selected.year, selected.month);
  const monthLabel = formatMonthTitle(selected.year, selected.month);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMonthlySummary(monthIso);
      if (seq !== loadSeqRef.current) return;
      if (res.error) {
        setRows([]);
        setError(phase8UserMessage(res.error));
      } else {
        setRows(res.data);
      }
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      setRows([]);
      setError(phase8UserMessage(err));
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [monthIso]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const byCategory = new Map<MonthlySummaryCategory, MonthlySummaryRow>();
  for (const row of rows) {
    byCategory.set(row.category, row);
  }

  const orderedRows: MonthlySummaryRow[] = CATEGORY_ORDER.map((category) => {
    const existing = byCategory.get(category);
    return (
      existing ?? {
        category,
        total_centavos: 0,
        count: 0,
      }
    );
  });

  const hasActivity = orderedRows.some(
    (r) => Math.abs(r.total_centavos) > 0 || r.count > 0
  );
  const maxTotal = Math.max(...orderedRows.map((r) => Math.abs(r.total_centavos)), 1);

  const moneyIn = Math.abs(byCategory.get('money_in')?.total_centavos ?? 0);
  const moneyOut =
    Math.abs(byCategory.get('transfers_out')?.total_centavos ?? 0) +
    Math.abs(byCategory.get('bills')?.total_centavos ?? 0) +
    Math.abs(byCategory.get('cash_out')?.total_centavos ?? 0);

  return (
    <FeatureScreen title="Monthly summary">
      {/* Month selector */}
      <Card variant="default" style={styles.monthCard}>
        <Pressable
          onPress={() => setSelected((prev) => shiftMonth(prev, -1))}
          style={styles.monthBtn}
          feedbackType="scale"
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <ChevronLeft size={CHEVRON_SIZE} color={colors.ink} />
        </Pressable>

        <Text variant="title" color={colors.ink} accessibilityRole="header">
          {monthLabel}
        </Text>

        <Pressable
          onPress={() => {
            if (!isCurrentMonth) setSelected((prev) => shiftMonth(prev, 1));
          }}
          disabled={isCurrentMonth}
          style={[styles.monthBtn, isCurrentMonth && styles.monthBtnDisabled]}
          feedbackType="scale"
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <ChevronRight
            size={CHEVRON_SIZE}
            color={isCurrentMonth ? colors.textMuted : colors.ink}
          />
        </Pressable>
      </Card>

      {loading ? (
        <View style={styles.section} testID="monthly-summary-loading">
          <Skeleton
            width="100%"
            height={SKELETON_OVERVIEW_HEIGHT}
            style={styles.skeleton}
          />
          <Skeleton width="100%" height={SKELETON_LIST_HEIGHT} style={styles.skeleton} />
        </View>
      ) : error ? (
        <EmptyState
          title="Summary unavailable"
          description={error}
          icon={<AlertCircle size={32} color={colors.redText} />}
          actionTitle="Try again"
          onAction={() => void load()}
          scrollable={false}
        />
      ) : !hasActivity ? (
        <EmptyState
          title="No activity this month"
          description={`Transactions in ${monthLabel} will appear here.`}
          icon={<BarChart3 size={32} color={colors.textMuted} />}
          scrollable={false}
        />
      ) : (
        <View style={styles.section}>
          {/* Totals Overview Card */}
          <Card variant="default" style={styles.overviewCard}>
            <View style={styles.overviewCol}>
              <Text variant="caption" color={colors.textSecondary}>
                Money in
              </Text>
              <AmountText
                amountCentavos={moneyIn}
                hidden={hideBalance}
                variant="title"
                color={colors.primary}
                showSign={false}
                maxFontSizeMultiplier={1.4}
              />
            </View>
            <View style={styles.overviewDivider} />
            <View style={styles.overviewCol}>
              <Text variant="caption" color={colors.textSecondary}>
                Money out
              </Text>
              <AmountText
                amountCentavos={moneyOut}
                hidden={hideBalance}
                variant="title"
                color={colors.ink}
                showSign={false}
                maxFontSizeMultiplier={1.4}
              />
            </View>
          </Card>

          {/* Breakdown by category */}
          <Text variant="title" color={colors.ink} accessibilityRole="header">
            By category
          </Text>
          <GroupedList>
            {orderedRows.map((row, idx) => {
              const meta = CATEGORY_META[row.category];
              const absTotal = Math.abs(row.total_centavos);
              const pct =
                absTotal > 0 ? Math.max(Math.round((absTotal / maxTotal) * 100), 4) : 0;
              const countLabel = `${row.count} transaction${row.count === 1 ? '' : 's'}`;
              return (
                <View key={row.category}>
                  {idx > 0 ? <ListHairline /> : null}
                  <View style={styles.categoryRow}>
                    <View style={styles.categoryTop}>
                      <View
                        style={[groupedListStyles.disc, { backgroundColor: meta.discBg }]}
                      >
                        {meta.renderIcon()}
                      </View>
                      <View style={styles.categoryInfo}>
                        <Text variant="bodyStrong" color={colors.ink}>
                          {meta.label}
                        </Text>
                        <Text variant="caption" color={colors.textMuted}>
                          {countLabel}
                        </Text>
                      </View>
                      <AmountText
                        amountCentavos={absTotal}
                        hidden={hideBalance}
                        variant="bodyStrong"
                        color={row.category === 'money_in' ? colors.primary : colors.ink}
                        showSign={false}
                        maxFontSizeMultiplier={1.4}
                      />
                    </View>
                    <View style={styles.barTrack} testID={`summary-bar-${row.category}`}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${pct}%`, backgroundColor: meta.barColor },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </GroupedList>
        </View>
      )}
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  monthCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  monthBtn: {
    minWidth: size.touch,
    minHeight: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthBtnDisabled: {
    opacity: 0.35,
  },
  section: {
    gap: spacing.base,
  },
  skeleton: {
    borderRadius: radius.md,
  },
  overviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderRadius: radius.md,
  },
  overviewCol: {
    flex: 1,
    gap: spacing.xs,
  },
  overviewDivider: {
    width: StyleSheet.hairlineWidth,
    height: size.touch,
    backgroundColor: colors.border,
    marginHorizontal: spacing.base,
  },
  categoryRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  categoryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
  },
  categoryInfo: {
    flex: 1,
  },
  barTrack: {
    height: BAR_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSubtle,
    overflow: 'hidden',
    marginLeft: 56,
  },
  barFill: {
    height: BAR_HEIGHT,
    borderRadius: radius.pill,
  },
});
