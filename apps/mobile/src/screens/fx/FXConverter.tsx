import React, {
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, TextInput, View, StyleSheet } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  size,
  typography,
  type FXPair,
  formatFXRate,
  formatFXAmount,
  convertFXAmount,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { Pressable } from '../../components/Pressable';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/Button';
export interface FXConverterRef {
  focus: () => void;
}

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

/** "2026-11-20" → "Nov 20, 2026". */
function formatRateDate(isoDate: string | null): string {
  if (!isoDate) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  const [, y, month, day] = match;
  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${Number(y)}`;
}

/** "1,000.00" → 100000 centavos; caps at 2 decimals; non-numeric → 0. */
function parseAmountMinor(text: string): number {
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    parts[1] = parts[1].slice(0, 2);
  }
  const value = Number(parts.join('.'));
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100);
}

/** "1000.00" → "1,000.00", at most 2 decimals. */
function groupAmount(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (!cleaned) return '';
  const parts = cleaned.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (parts.length > 2) {
    return `${parts[0]}.${parts[1].slice(0, 2)}`;
  }
  if (parts.length === 2) {
    return `${parts[0]}.${parts[1].slice(0, 2)}`;
  }
  return parts[0];
}

type Direction = 'PHP_TO_FX' | 'FX_TO_PHP';

interface FXConverterProps {
  pair: FXPair;
  rate: number | null;
  rateDate: string | null;
  stale: boolean;
  loading: boolean;
}

const FXConverter = React.forwardRef<FXConverterRef, FXConverterProps>(
  function FXConverter({ pair, rate, rateDate, stale, loading }: FXConverterProps, ref) {
    const [amount, setAmount] = useState('');
    const [direction, setDirection] = useState<Direction>('PHP_TO_FX');
    const inputRef = useRef<any>(null);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          inputRef.current?.focus();
        },
      }),
      []
    );

    const base = pair.split('/')[0];
    const isPhpToFx = direction === 'PHP_TO_FX';
    const inputCurrency = isPhpToFx ? 'PHP' : base;
    const outputCurrency = isPhpToFx ? base : 'PHP';
    const inputPrefix = isPhpToFx ? '₱' : `${base} `;
    const outputPrefix = isPhpToFx ? `${base} ` : '₱';
    const inputLabel = isPhpToFx ? 'Amount (PHP)' : `Amount (${base})`;

    const conversion = useMemo(() => {
      if (!amount || !rate) return null;
      const amountMinor = parseAmountMinor(amount);
      if (amountMinor === 0) return null;
      return convertFXAmount(amountMinor, rate, direction, rateDate ?? '');
    }, [amount, rate, direction, rateDate]);

    const convertedAmount = conversion
      ? formatFXAmount(conversion.resultMinor, outputCurrency)
      : null;

    const announceStale = useCallback(() => {
      if (stale && rateDate) {
        AccessibilityInfo.announceForAccessibility(
          `Stale rate. Rate last updated ${formatRateDate(rateDate)}. Conversion is indicative only.`
        );
      }
    }, [stale, rateDate]);

    // Announce when the stale state becomes current (e.g. route opens on a stale rate).
    useMemo(() => {
      announceStale();
    }, [announceStale]);

    return (
      <Card variant="default" style={styles.card}>
        {loading ? (
          <View style={styles.skeletonWrapper}>
            <Skeleton width={220} height={52} style={styles.skeletonInput} />
            <Skeleton width="40%" height={32} style={styles.skeletonResult} />
            <Skeleton width="30%" height={24} style={styles.skeletonCaption} />
          </View>
        ) : rate === null ? (
          <EmptyState
            title="Rate unavailable"
            description={`No reference rate for ${pair} right now. Try again later.`}
            actionTitle="Try again"
            onAction={() => {
              // No-op placeholder: the screen reloads rates on pair change.
            }}
            scrollable={false}
            illustrationTestID="fx-rate-unavailable"
          />
        ) : (
          <>
            {/* Direction toggle — ₱ ↔ FX currency */}
            <View style={styles.directionRow}>
              <Pressable
                onPress={() => setDirection('PHP_TO_FX')}
                feedbackType="scale"
                accessibilityRole="button"
                accessibilityLabel={`Convert ₱ to ${base}`}
                accessibilityState={{ selected: isPhpToFx }}
                style={[
                  styles.directionButton,
                  isPhpToFx && styles.directionButtonSelected,
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text
                  variant="label"
                  color={isPhpToFx ? colors.primary : colors.ink}
                  style={styles.directionText}
                  maxFontSizeMultiplier={1.4}
                >
                  ₱ → {base}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDirection('FX_TO_PHP')}
                feedbackType="scale"
                accessibilityRole="button"
                accessibilityLabel={`Convert ${base} to ₱`}
                accessibilityState={{ selected: !isPhpToFx }}
                style={[
                  styles.directionButton,
                  !isPhpToFx && styles.directionButtonSelected,
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text
                  variant="label"
                  color={!isPhpToFx ? colors.primary : colors.ink}
                  style={styles.directionText}
                  maxFontSizeMultiplier={1.4}
                >
                  {base} → ₱
                </Text>
              </Pressable>
            </View>

            {/* Amount input (AmountInput/TextField pattern: label + helper text + bordered box + error text) */}
            <Text
              variant="label"
              color={colors.textSecondary}
              style={styles.inputLabel}
              maxFontSizeMultiplier={1.4}
            >
              {inputLabel}
            </Text>
            <View style={styles.inputRow}>
              <Text variant="amount" color={colors.ink} style={styles.inputPrefix}>
                {inputPrefix}
              </Text>
              <TextInput
                ref={inputRef}
                value={amount}
                onChangeText={(text) => setAmount(groupAmount(text))}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                style={styles.textInput}
                accessibilityLabel={inputLabel}
                accessibilityHint="Enter the amount to convert (up to 2 decimal places)"
                maxFontSizeMultiplier={1.4}
              />
            </View>
            <Text
              variant="caption"
              color={colors.textMuted}
              style={styles.helperText}
              maxFontSizeMultiplier={1.4}
            >
              Up to 2 decimal places.
            </Text>

            {/* Conversion result */}
            {conversion ? (
              <View style={styles.resultRow}>
                <Text
                  variant="amount"
                  color={colors.ink}
                  style={styles.resultAmount}
                  maxFontSizeMultiplier={1.4}
                >
                  {outputPrefix}
                  {convertedAmount}
                </Text>
                <Text
                  variant="caption"
                  color={colors.textMuted}
                  style={styles.resultHint}
                  maxFontSizeMultiplier={1.4}
                >
                  {amount} {inputPrefix.trim()} → {convertedAmount} {outputPrefix.trim()}
                </Text>
              </View>
            ) : amount ? (
              <Text variant="caption" color={colors.textMuted} style={styles.emptyText}>
                Enter an amount to convert.
              </Text>
            ) : null}

            {/* Reference rate + date */}
            <View style={styles.rateDateRow}>
              <Text
                variant="caption"
                color={colors.textMuted}
                style={styles.rateDateText}
                maxFontSizeMultiplier={1.4}
              >
                Reference rate · {formatRateDate(rateDate)}
              </Text>
              <Text
                variant="caption"
                color={colors.textMuted}
                style={styles.rateText}
                maxFontSizeMultiplier={1.4}
              >
                1 {base} = ₱{formatFXRate(rate, base)}
              </Text>
            </View>

            {/* Stale-rate notice — alert role, announced */}
            {stale && rateDate && (
              <View
                style={styles.staleNotice}
                accessible={true}
                accessibilityRole="alert"
                accessibilityLabel={`Stale rate. Rate last updated ${formatRateDate(rateDate)}. Conversion is indicative only.`}
              >
                <AlertCircle size={16} color={colors.orangeText} />
                <Text
                  variant="caption"
                  color={colors.orangeText}
                  style={styles.staleNoticeText}
                  maxFontSizeMultiplier={1.4}
                >
                  Rate last updated {formatRateDate(rateDate)} — conversion is indicative
                  only.
                </Text>
              </View>
            )}
          </>
        )}
      </Card>
    );
  }
);

FXConverter.displayName = 'FXConverter';

export { FXConverter };

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    marginTop: spacing.lg,
  },
  directionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  directionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: size.touch,
    minWidth: size.touch,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
  },
  directionButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  directionText: {
    color: colors.ink,
  },
  skeletonWrapper: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  skeletonInput: {
    width: 220,
    height: 52,
    borderRadius: radius.md,
  },
  skeletonResult: {
    height: 32,
    borderRadius: radius.md,
  },
  skeletonCaption: {
    height: 24,
    borderRadius: radius.sm,
  },
  emptyState: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
  inputLabel: {
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    minHeight: size.control,
    paddingHorizontal: spacing.base,
  },
  inputPrefix: {
    marginRight: spacing.xs,
  },
  textInput: {
    flex: 1,
    fontSize: typography.amount.fontSize,
    lineHeight: typography.amount.lineHeight,
    fontFamily: typography.amount.fontFamily,
    color: colors.ink,
    padding: 0,
  },
  helperText: {
    marginTop: spacing.xs,
  },
  resultRow: {
    marginTop: spacing.md,
  },
  resultAmount: {},
  resultHint: {
    marginTop: spacing.xs,
  },
  rateDateRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  rateDateText: {},
  rateText: {},
  staleNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tintOrange,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  staleNoticeText: {
    marginLeft: spacing.xs,
    flex: 1,
  },
});
