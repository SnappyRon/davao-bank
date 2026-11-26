import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AlertCircle,
  CreditCard as CreditCardIcon,
  Receipt,
  Snowflake,
  Wallet,
} from 'lucide-react-native';
import {
  colors,
  fetchCardStatement,
  fetchCardTransactions,
  fetchMyCards,
  formatCentavosToPHP,
  formatReferenceId,
  radius,
  size,
  spacing,
  toUserMessage,
  type CardStatement,
  type CardTransaction,
  type MyCards,
} from '@davao-bank/shared';
import type { RootStackParamList } from '../../App';
import { supabase } from '../lib/supabase';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FeatureScreen,
  GroupedList,
  ListHairline,
  ListRow,
  Pressable,
  Sheet,
  Skeleton,
  Text,
  LIST_ICON_SIZE,
} from '../components';

/** Exact D-W2 disclaimer. Do not paraphrase or append a success state. */
export const APPLE_WALLET_BUTTON_LABEL = 'Add to Apple Wallet';
export const APPLE_WALLET_COPY =
  "Apple Pay isn't available yet. It will only work once Davao Bank is a licensed card issuer approved by Apple and the card networks. Davao Bank is a simulated academic prototype, so no real card is added to your Wallet.";
export const CARD_SIMULATION_COPY =
  'Simulation — virtual card. Payments use play money and a demo biller; no credit is extended.';

const TEXT_MAX_SCALE = 1.4;
const SKELETON_COUNT = 3;

function readableReference(reference: string): string {
  if (!reference) return '';
  return /^db-/i.test(reference) ? reference : formatReferenceId(reference);
}

export function AppleWalletInfoSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={APPLE_WALLET_BUTTON_LABEL}>
      <Text variant="body" maxFontSizeMultiplier={TEXT_MAX_SCALE}>
        {APPLE_WALLET_COPY}
      </Text>
      <View style={styles.sheetFooter}>
        <Button title="Close" onPress={onClose} variant="secondary" />
      </View>
    </Sheet>
  );
}

export function CardsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();

  const [cards, setCards] = useState<MyCards | null>(null);
  const [statement, setStatement] = useState<CardStatement | null>(null);
  const [transactions, setTransactions] = useState<CardTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletVisible, setWalletVisible] = useState(false);

  const loadCards = useCallback(async (pullToRefresh = false) => {
    if (pullToRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [cardsResult, transactionsResult] = await Promise.all([
        fetchMyCards(supabase),
        fetchCardTransactions(supabase, 20),
      ]);
      if (cardsResult.error) throw cardsResult.error;
      if (transactionsResult.error) throw transactionsResult.error;

      const nextCards = cardsResult.data;
      setCards(nextCards);
      setTransactions(transactionsResult.data ?? []);

      const embedded = nextCards?.statements?.[0] ?? null;
      if (embedded) {
        setStatement(embedded);
      } else if (nextCards?.credit_card?.statement_id) {
        const statementResult = await fetchCardStatement(
          supabase,
          nextCards.credit_card.statement_id
        );
        if (statementResult.error) throw statementResult.error;
        setStatement(statementResult.data);
      } else {
        setStatement(null);
      }
    } catch (err) {
      setError(toUserMessage(err, 'load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) void loadCards();
  }, [isFocused, loadCards]);

  const openWalletSheet = useCallback(() => setWalletVisible(true), []);
  const closeWalletSheet = useCallback(() => setWalletVisible(false), []);

  const debitCard = cards?.debit_cards?.[0] ?? null;
  const creditCard = cards?.credit_card ?? null;
  const statementTarget = statement && creditCard ? { statement, creditCard } : null;

  return (
    <FeatureScreen
      title="Cards"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void loadCards(true)} />
      }
    >
      <View style={styles.content}>
        <View
          accessibilityRole="alert"
          testID="card-simulation-notice"
          style={styles.simulationNotice}
        >
          <Text
            variant="caption"
            color={colors.ink}
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
          >
            {CARD_SIMULATION_COPY}
          </Text>
        </View>

        {loading ? (
          <View testID="cards-loading">
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <Card key={index} style={styles.skeletonCard}>
                <Skeleton width="70%" height={18} />
                <Skeleton width="100%" height={14} />
              </Card>
            ))}
          </View>
        ) : null}

        {!loading && error ? (
          <Card style={styles.errorCard}>
            <AlertCircle size={LIST_ICON_SIZE} color={colors.redText} />
            <Text variant="bodyStrong" color={colors.redText} accessibilityRole="alert">
              {error}
            </Text>
            <Button
              title="Try again"
              onPress={() => void loadCards()}
              variant="secondary"
            />
          </Card>
        ) : null}

        {!loading && !error && cards ? (
          <>
            {debitCard ? (
              <View testID="debit-card-summary">
                <Text variant="h2" style={styles.sectionTitle}>
                  Debit card
                </Text>
                <Card variant="primary" style={styles.cardArt}>
                  <View style={styles.cardArtTop}>
                    <Text
                      variant="caption"
                      color={colors.textInverse}
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    >
                      Davao Bank debit (simulation)
                    </Text>
                    <Badge
                      label={debitCard.status === 'frozen' ? 'Frozen' : 'Active'}
                      variant={debitCard.status === 'frozen' ? 'neutral' : 'success'}
                    />
                  </View>
                  <Text
                    variant="amount"
                    color={colors.textInverse}
                    tabularNums
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    style={styles.maskedNumber}
                  >
                    •••• {debitCard.masked_last4}
                  </Text>
                  <Text
                    variant="caption"
                    color={colors.textInverse}
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  >
                    Expires {debitCard.expiry_month}/{debitCard.expiry_year}
                  </Text>
                </Card>
                <View style={styles.inlineActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Debit card ending ${debitCard.masked_last4}, view details`}
                    style={styles.inlineAction}
                    onPress={() => navigation.navigate('CardDetail', { card: debitCard })}
                  >
                    <Snowflake size={18} color={colors.primary} />
                    <Text variant="bodyStrong" color={colors.primary}>
                      Card details
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={APPLE_WALLET_BUTTON_LABEL}
                    style={styles.inlineAction}
                    onPress={openWalletSheet}
                  >
                    <Wallet size={18} color={colors.blueText} />
                    <Text variant="bodyStrong" color={colors.blueText}>
                      {APPLE_WALLET_BUTTON_LABEL}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {creditCard ? (
              <View testID="credit-card-summary">
                <Text variant="h2" style={styles.sectionTitle}>
                  Credit card
                </Text>
                <Card style={styles.creditCard}>
                  <View style={styles.cardArtTop}>
                    <View style={styles.creditIconDisc}>
                      <CreditCardIcon size={LIST_ICON_SIZE} color={colors.blueText} />
                    </View>
                    <Text
                      variant="caption"
                      color={colors.textSecondary}
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    >
                      •••• {creditCard.masked_last4}
                    </Text>
                  </View>
                  <SummaryRow
                    label="Amount due"
                    value={formatCentavosToPHP(creditCard.amount_due_cents)}
                  />
                  <SummaryRow
                    label="Available credit"
                    value={formatCentavosToPHP(creditCard.available_credit_cents)}
                  />
                  <SummaryRow
                    label="Credit limit"
                    value={formatCentavosToPHP(creditCard.credit_limit_cents)}
                  />
                  {statementTarget ? (
                    <Button
                      title="View statement"
                      accessibilityLabel="View credit card statement"
                      onPress={() =>
                        navigation.navigate('CardStatement', statementTarget)
                      }
                      style={styles.statementButton}
                    />
                  ) : (
                    <Text
                      variant="caption"
                      color={colors.textMuted}
                      style={styles.statementButton}
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    >
                      Statement details will appear when available.
                    </Text>
                  )}
                </Card>
              </View>
            ) : null}

            <Text variant="h2" style={styles.sectionTitle}>
              Card services
            </Text>
            <GroupedList testID="card-services-list">
              {debitCard ? (
                <ListRow
                  title="Card details"
                  subtitle="Reveal, freeze or set a daily limit"
                  leftElement={<Snowflake size={LIST_ICON_SIZE} color={colors.primary} />}
                  showChevron
                  onPress={() => navigation.navigate('CardDetail', { card: debitCard })}
                />
              ) : null}
              <ListHairline />
              <ListRow
                title={APPLE_WALLET_BUTTON_LABEL}
                subtitle="See why Wallet is not available in the prototype"
                leftElement={<Wallet size={LIST_ICON_SIZE} color={colors.blueText} />}
                showChevron
                onPress={openWalletSheet}
              />
              {statementTarget ? (
                <>
                  <ListHairline />
                  <ListRow
                    title="Credit statement"
                    subtitle={`Amount due ${formatCentavosToPHP(statementTarget.statement.amount_due_cents)}`}
                    leftElement={
                      <Receipt size={LIST_ICON_SIZE} color={colors.blueText} />
                    }
                    showChevron
                    onPress={() => navigation.navigate('CardStatement', statementTarget)}
                  />
                </>
              ) : null}
            </GroupedList>

            <Text variant="h2" style={styles.sectionTitle}>
              Card activity
            </Text>
            {transactions.length === 0 ? (
              <EmptyState
                title="No card activity"
                description="Card payments and credit bill payments will appear here."
              />
            ) : (
              <GroupedList testID="card-activity-list">
                {transactions.map((item, index) => (
                  <React.Fragment key={item.id || `${item.reference}-${index}`}>
                    {index > 0 ? <ListHairline /> : null}
                    <ListRow
                      title={item.label}
                      subtitle={readableReference(item.reference)}
                      rightElement={
                        <Text
                          variant="bodyStrong"
                          color={colors.ink}
                          tabularNums
                          maxFontSizeMultiplier={TEXT_MAX_SCALE}
                        >
                          {formatCentavosToPHP(item.amount_cents)}
                        </Text>
                      }
                    />
                  </React.Fragment>
                ))}
              </GroupedList>
            )}
          </>
        ) : null}
      </View>
      <AppleWalletInfoSheet visible={walletVisible} onClose={closeWalletSheet} />
    </FeatureScreen>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text
        variant="body"
        color={colors.textSecondary}
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
      >
        {label}
      </Text>
      <Text variant="bodyStrong" tabularNums maxFontSizeMultiplier={TEXT_MAX_SCALE}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  simulationNotice: {
    backgroundColor: colors.tintBlue,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  sectionTitle: {
    marginTop: spacing.sm,
  },
  skeletonCard: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  errorCard: {
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  cardArt: {
    minHeight: 176,
    justifyContent: 'space-between',
  },
  cardArtTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  maskedNumber: {
    marginVertical: spacing.lg,
  },
  inlineActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  inlineAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: size.touch,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  creditCard: {
    gap: spacing.sm,
  },
  creditIconDisc: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.tintBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  statementButton: {
    marginTop: spacing.sm,
  },
  sheetFooter: {
    marginTop: spacing.lg,
  },
});
