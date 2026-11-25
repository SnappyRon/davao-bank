import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertCircle } from 'lucide-react-native';
import {
  colors,
  formatCentavosToPHP,
  phpToCentavos,
  radius,
  spacing,
  typography,
  addOnRateToAnnualRate,
  computeAmortization,
  formatInstallmentRate,
  isInstallmentTerm,
  offerForTerm,
  MAX_INSTALLMENT_CENTAVOS,
  MIN_INSTALLMENT_CENTAVOS,
  type InstallmentTermMonths,
} from '@davao-bank/shared';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { FeatureScreen } from '../components/FeatureScreen';
import { Chip, FilterChips } from '../components/Chip';
import { GroupedList, ListHairline } from '../components/GroupedList';
import { OfflineBanner } from '../components/OfflineBanner';
import { Skeleton } from '../components/Skeleton';
import { Text } from '../components/Text';

/** Route name registered by the hub owner: `InstallmentCalculator`. */
export const SIMULATION_BADGE = 'Simulation — not a loan offer';
export const SIMULATION_NOTICE =
  'Simulation — illustrative rates only. Not a credit offer or approval.';
export const ELIGIBILITY_NOTICE =
  'Demo eligibility uses only your standing in this app. No credit check or approval.';

const STORAGE_KEY = '@davao-bank/installment-quote';
const TERM_OPTIONS: Array<{ value: InstallmentTermMonths; label: string }> = [
  { value: 3, label: '3 months' },
  { value: 6, label: '6 months' },
  { value: 12, label: '12 months' },
  { value: 24, label: '24 months' },
];
type RateBasis = 'ADD_ON' | 'ANNUAL';

interface SavedQuote {
  amountText: string;
  termMonths: InstallmentTermMonths;
}

function readSavedQuote(raw: string | null): SavedQuote | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const value = parsed as Partial<SavedQuote>;
      if (typeof value.amountText === 'string' && isInstallmentTerm(value.termMonths)) {
        return { amountText: value.amountText, termMonths: value.termMonths };
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Groups thousands while allowing at most two decimals; keeps centavos exact. */
function formatAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const [whole, ...decimals] = cleaned.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimals.length > 0 ? `${grouped}.${decimals.join('').slice(0, 2)}` : grouped;
}

/**
 * Client-only installment calculator (spec §4.6). The quote never leaves the
 * device: the only persistence is a local saved quote, and no RPC, migration,
 * balance write or credit decision is involved.
 */
export function InstallmentCalculatorScreen() {
  const [amountText, setAmountText] = useState('');
  const [termMonths, setTermMonths] = useState<InstallmentTermMonths>(12);
  const [rateBasis, setRateBasis] = useState<RateBasis>('ADD_ON');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadQuote = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const savedQuote = readSavedQuote(await AsyncStorage.getItem(STORAGE_KEY));
      if (savedQuote) {
        setAmountText(savedQuote.amountText);
        setTermMonths(savedQuote.termMonths);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuote();
  }, [loadQuote]);

  const amountCentavos = phpToCentavos(amountText);
  const hasAmount = amountText.trim().length > 0;
  const amountError =
    hasAmount &&
    (amountCentavos < MIN_INSTALLMENT_CENTAVOS ||
      amountCentavos > MAX_INSTALLMENT_CENTAVOS)
      ? 'Enter an amount from ₱100 to ₱1,000,000.'
      : null;
  const offer = offerForTerm(termMonths);
  const quote = useMemo(
    () =>
      offer && hasAmount && !amountError
        ? computeAmortization(amountCentavos, termMonths, offer.addOnRate)
        : null,
    [amountCentavos, amountError, hasAmount, offer, termMonths]
  );

  const displayedRate = offer
    ? rateBasis === 'ADD_ON'
      ? offer.addOnRate
      : addOnRateToAnnualRate(offer.addOnRate, termMonths)
    : 0;
  const rateLabel =
    rateBasis === 'ADD_ON' ? 'Add-on rate' : 'Annual rate (simple equivalent)';
  const finalPayment = quote?.schedule[quote.schedule.length - 1]?.paymentCents ?? 0;

  const saveQuote = async () => {
    if (!quote) return;
    setSaveError(false);
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ amountText, termMonths } satisfies SavedQuote)
      );
      setSaved(true);
    } catch {
      setSaveError(true);
    }
  };

  const changeAmount = (text: string) => {
    setAmountText(formatAmountInput(text));
    setSaved(false);
    setSaveError(false);
  };

  const changeTerm = (months: InstallmentTermMonths) => {
    setTermMonths(months);
    setSaved(false);
    setSaveError(false);
  };

  return (
    <FeatureScreen
      title="Installment calculator"
      footer={
        <Button
          title="Save quote"
          onPress={() => void saveQuote()}
          disabled={!quote || loading}
          accessibilityLabel="Save quote on this device"
        />
      }
    >
      <OfflineBanner />

      <View style={styles.simulationBox} accessibilityRole="text">
        <Badge
          label={SIMULATION_BADGE}
          variant="warning"
          testID="installment-simulation-badge"
        />
        <Text
          variant="caption"
          color={colors.orangeText}
          style={styles.simulationNotice}
          maxFontSizeMultiplier={1.4}
        >
          {SIMULATION_NOTICE}
        </Text>
      </View>

      {loading ? (
        <View testID="installment-skeleton" style={styles.skeletonBox}>
          <Skeleton height={52} borderRadius={radius.md} />
          <Skeleton width="60%" height={24} />
          <Skeleton height={120} borderRadius={radius.md} />
          <Skeleton height={72} borderRadius={radius.md} />
        </View>
      ) : loadError ? (
        <EmptyState
          title="Couldn't load your saved quote"
          description="Your quote stays on this device. Try again."
          actionTitle="Try again"
          onAction={() => void loadQuote()}
          scrollable={false}
        />
      ) : (
        <>
          <Card style={styles.inputCard}>
            <View style={styles.labelRow}>
              <Text
                variant="label"
                color={colors.textSecondary}
                maxFontSizeMultiplier={1.4}
              >
                Amount
              </Text>
              <Text
                variant="caption"
                color={colors.textMuted}
                maxFontSizeMultiplier={1.4}
              >
                ₱100 to ₱1,000,000
              </Text>
            </View>
            <View style={styles.amountRow}>
              <Text variant="amount" color={colors.ink} style={styles.currencyPrefix}>
                ₱
              </Text>
              <TextInput
                value={amountText}
                onChangeText={changeAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Amount in pesos"
                accessibilityHint="Enter an amount from ₱100 to ₱1,000,000"
                maxFontSizeMultiplier={1.4}
                style={styles.amountInput}
              />
            </View>
            {amountError ? (
              <Text variant="caption" color={colors.redText} maxFontSizeMultiplier={1.4}>
                {amountError}
              </Text>
            ) : null}

            <Text
              variant="label"
              color={colors.textSecondary}
              style={styles.sectionLabel}
              maxFontSizeMultiplier={1.4}
            >
              Term
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {TERM_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={option.value === termMonths}
                  onPress={() => changeTerm(option.value)}
                />
              ))}
            </ScrollView>

            <Text
              variant="label"
              color={colors.textSecondary}
              style={styles.sectionLabel}
              maxFontSizeMultiplier={1.4}
            >
              Rate shown
            </Text>
            <FilterChips<RateBasis>
              options={[
                { value: 'ADD_ON', label: 'Add-on' },
                { value: 'ANNUAL', label: 'Annual' },
              ]}
              selectedValue={rateBasis}
              onSelect={(basis) => setRateBasis(basis)}
            />
            <View style={styles.rateRow}>
              <Text
                variant="h2"
                color={colors.primary}
                tabularNums
                maxFontSizeMultiplier={1.4}
              >
                {formatInstallmentRate(displayedRate)}
              </Text>
              <Text
                variant="caption"
                color={colors.textSecondary}
                style={styles.rateLabel}
                maxFontSizeMultiplier={1.4}
              >
                {rateLabel} · {termMonths} months
              </Text>
            </View>
          </Card>

          {amountError ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <AlertCircle size={18} color={colors.redText} />
              <Button
                title="Try again"
                variant="secondary"
                onPress={() => changeAmount('')}
                style={styles.retryButton}
                accessibilityLabel="Try again with a different amount"
              />
            </View>
          ) : null}

          {!hasAmount ? (
            <EmptyState
              title="No quote yet"
              description="Enter an amount to see your monthly payment and schedule."
              scrollable={false}
            />
          ) : quote ? (
            <>
              <Card style={styles.resultCard}>
                <Text
                  variant="label"
                  color={colors.textSecondary}
                  maxFontSizeMultiplier={1.4}
                >
                  Monthly amount
                </Text>
                <Text
                  variant="amount"
                  color={colors.ink}
                  tabularNums
                  maxFontSizeMultiplier={1.4}
                >
                  {formatCentavosToPHP(quote.monthlyCents)}
                </Text>
                <Text
                  variant="caption"
                  color={colors.textMuted}
                  style={styles.resultCaption}
                  maxFontSizeMultiplier={1.4}
                >
                  Last payment {formatCentavosToPHP(finalPayment)} — centavos are adjusted
                  in the final month.
                </Text>
                <View style={styles.metricRow}>
                  <Text
                    variant="caption"
                    color={colors.textSecondary}
                    maxFontSizeMultiplier={1.4}
                  >
                    Total interest
                  </Text>
                  <Text variant="bodyStrong" tabularNums maxFontSizeMultiplier={1.4}>
                    {formatCentavosToPHP(quote.totalInterestCents)}
                  </Text>
                </View>
                <View style={styles.metricRow}>
                  <Text
                    variant="caption"
                    color={colors.textSecondary}
                    maxFontSizeMultiplier={1.4}
                  >
                    Total payable
                  </Text>
                  <Text variant="bodyStrong" tabularNums maxFontSizeMultiplier={1.4}>
                    {formatCentavosToPHP(quote.totalPayableCents)}
                  </Text>
                </View>
              </Card>

              <Text
                variant="title"
                color={colors.ink}
                accessibilityRole="header"
                maxFontSizeMultiplier={1.4}
              >
                Payment schedule
              </Text>
              <GroupedList testID="installment-schedule">
                {quote.schedule.map((row, index) => (
                  <React.Fragment key={row.month}>
                    {index > 0 ? <ListHairline /> : null}
                    <View
                      style={styles.scheduleRow}
                      accessible
                      accessibilityRole="text"
                      accessibilityLabel={`Month ${row.month} of ${termMonths}, payment ${formatCentavosToPHP(row.paymentCents)}`}
                    >
                      <View style={styles.scheduleRowTop}>
                        <Text variant="bodyStrong" maxFontSizeMultiplier={1.4}>
                          Month {row.month} of {termMonths}
                        </Text>
                        <Text
                          variant="bodyStrong"
                          tabularNums
                          maxFontSizeMultiplier={1.4}
                        >
                          {formatCentavosToPHP(row.paymentCents)}
                        </Text>
                      </View>
                      <Text
                        variant="caption"
                        color={colors.textSecondary}
                        tabularNums
                        maxFontSizeMultiplier={1.4}
                      >
                        Principal {formatCentavosToPHP(row.principalCents)} · Interest{' '}
                        {formatCentavosToPHP(row.interestCents)} · Balance{' '}
                        {formatCentavosToPHP(row.remainingBalanceCents)}
                      </Text>
                    </View>
                  </React.Fragment>
                ))}
              </GroupedList>

              <Text
                variant="caption"
                color={colors.textSecondary}
                style={styles.eligibility}
                maxFontSizeMultiplier={1.4}
              >
                {ELIGIBILITY_NOTICE}
              </Text>
            </>
          ) : null}

          {saveError ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <AlertCircle size={18} color={colors.redText} />
              <Text variant="body" color={colors.redText} style={styles.errorCopy}>
                Couldn't save the quote on this device. Try again.
              </Text>
              <Button
                title="Try again"
                variant="secondary"
                onPress={() => void saveQuote()}
                style={styles.retryButton}
                accessibilityLabel="Try saving the quote again"
              />
            </View>
          ) : saved ? (
            <Text variant="caption" color={colors.primary} maxFontSizeMultiplier={1.4}>
              Saved on this device.
            </Text>
          ) : null}
        </>
      )}
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  simulationBox: {
    gap: spacing.sm,
  },
  simulationNotice: {
    flexShrink: 1,
  },
  skeletonBox: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  inputCard: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
  },
  currencyPrefix: {
    marginRight: spacing.xs,
  },
  amountInput: {
    flex: 1,
    fontFamily: typography.amount.fontFamily,
    fontSize: typography.amount.fontSize,
    lineHeight: typography.amount.lineHeight,
    fontVariant: ['tabular-nums'],
    color: colors.ink,
    padding: 0,
  },
  sectionLabel: {
    marginTop: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  rateLabel: {
    flexShrink: 1,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tintRed,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  errorCopy: {
    flex: 1,
  },
  retryButton: {
    minWidth: 120,
  },
  resultCard: {
    gap: spacing.xs,
  },
  resultCaption: {
    marginBottom: spacing.sm,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  scheduleRow: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  scheduleRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  eligibility: {
    marginTop: spacing.xs,
  },
});
