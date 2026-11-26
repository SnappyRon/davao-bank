import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { AlertCircle, Eye, EyeOff, RefreshCw, Snowflake } from 'lucide-react-native';
import {
  colors,
  formatCentavosToPHP,
  phpToCentavos,
  radius,
  replaceCard,
  revealCardSecrets,
  setCardDailyLimit,
  setCardFrozen,
  setCardOnlinePurchases,
  spacing,
  toUserMessage,
  type DigitalDebitCard,
  type RevealedCardSecrets,
} from '@davao-bank/shared';
import type { RootStackParamList } from '../../App';
import { useSettings } from '../context/SettingsContext';
import { useTotpPrompt } from '../context/PasswordPromptContext';
import { supabase } from '../lib/supabase';
import { retryStepUp } from '../utils/stepUpRetry';
import { useConfirmSheet } from '../hooks/useConfirmSheet';
import {
  Badge,
  Button,
  Card,
  FeatureScreen,
  ListHairline,
  Pressable,
  StepUpSetupLink,
  Text,
  TextField,
  useToast,
} from '../components';
import { APPLE_WALLET_BUTTON_LABEL, AppleWalletInfoSheet } from './CardsScreen';

const TEXT_MAX_SCALE = 1.4;
const SECRET_DISPLAY_MS = 30_000;
const MAX_DAILY_LIMIT_CENTS = 500_000_000;

type AuthResult = { success: boolean; cancelled?: boolean; error?: string };

function groupPan(pan: string): string {
  return pan.replace(/(.{4})/g, '$1 ').trim();
}

export function CardDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'CardDetail'>>();
  const { confirmMoneyAction } = useSettings();
  const promptTotp = useTotpPrompt();
  const { showConfirmation, confirmSheet } = useConfirmSheet();
  const toast = useToast();

  const [card, setCard] = useState<DigitalDebitCard>(route.params.card);
  const [revealed, setRevealed] = useState<RevealedCardSecrets | null>(null);
  const [walletVisible, setWalletVisible] = useState(false);
  const [limitInput, setLimitInput] = useState(
    (route.params.card.daily_limit_cents / 100).toFixed(2)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const hideSecrets = useCallback(() => setRevealed(null), []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      setRevealed(null);
    };
  }, []);

  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(hideSecrets, SECRET_DISPLAY_MS);
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') hideSecrets();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [revealed, hideSecrets]);

  const authorize = useCallback(
    async (title: string, message: string): Promise<AuthResult> => {
      return confirmMoneyAction({ title, message });
    },
    [confirmMoneyAction]
  );

  const handleReveal = useCallback(async () => {
    setError(null);
    const auth = await authorize(
      'Reveal card details',
      'Confirm your identity to show the simulated card number and CVV.'
    );
    if (!auth.success) {
      setError(
        auth.cancelled
          ? 'Authorization cancelled. No card details were shown.'
          : auth.error || 'Authorization failed.'
      );
      return;
    }

    setBusy(true);
    try {
      const result = await retryStepUp(
        () => revealCardSecrets(supabase, card.id),
        promptTotp
      );
      if (result.error) throw result.error;
      if (!result.data) throw new Error('Card details unavailable');
      if (mountedRef.current) setRevealed(result.data);
    } catch (err) {
      if (mountedRef.current) setError(toUserMessage(err));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [authorize, card.id, promptTotp]);

  const handleFreeze = useCallback(async () => {
    setError(null);
    const freezing = card.status !== 'frozen';
    if (card.status === 'replaced' || card.status === 'closed') return;
    const auth = await authorize(
      freezing ? 'Freeze card' : 'Unfreeze card',
      freezing
        ? 'Confirm that you want to freeze this simulated card.'
        : 'Confirm that you want to unfreeze this simulated card.'
    );
    if (!auth.success) {
      setError(
        auth.cancelled
          ? 'Authorization cancelled. The card was not changed.'
          : auth.error || 'Authorization failed.'
      );
      return;
    }

    setBusy(true);
    try {
      const result = await retryStepUp(
        () => setCardFrozen(supabase, card.id, freezing, card),
        promptTotp
      );
      if (result.error) throw result.error;
      if (mountedRef.current) {
        setCard((current) => ({
          ...current,
          status: result.data?.status ?? (freezing ? 'frozen' : 'active'),
        }));
        toast.show(freezing ? 'Card frozen' : 'Card unfrozen');
      }
    } catch (err) {
      if (mountedRef.current) setError(toUserMessage(err));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [authorize, card, promptTotp, toast]);

  const handleOnlinePurchases = useCallback(async () => {
    setError(null);
    const enabling = !card.online_purchases_enabled;
    const auth = await authorize(
      enabling ? 'Allow online purchases' : 'Block online purchases',
      enabling
        ? 'Confirm that online purchases should be allowed for this card.'
        : 'Confirm that online purchases should be blocked for this card.'
    );
    if (!auth.success) {
      setError(
        auth.cancelled
          ? 'Authorization cancelled. The card was not changed.'
          : auth.error || 'Authorization failed.'
      );
      return;
    }

    setBusy(true);
    try {
      const result = await retryStepUp(
        () => setCardOnlinePurchases(supabase, card.id, enabling, card),
        promptTotp
      );
      if (result.error) throw result.error;
      if (mountedRef.current) {
        setCard((current) => ({
          ...current,
          online_purchases_enabled: result.data?.online_purchases_enabled ?? enabling,
        }));
        toast.show(enabling ? 'Online purchases allowed' : 'Online purchases blocked');
      }
    } catch (err) {
      if (mountedRef.current) setError(toUserMessage(err));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [authorize, card, promptTotp, toast]);

  const handleDailyLimit = useCallback(async () => {
    setError(null);
    const limitCents = phpToCentavos(limitInput);
    if (
      !Number.isInteger(limitCents) ||
      limitCents <= 0 ||
      limitCents > MAX_DAILY_LIMIT_CENTS
    ) {
      setError('Daily limit must be between ₱0.01 and ₱5,000,000.00');
      return;
    }
    const auth = await authorize(
      'Change daily limit',
      `Confirm a new daily card limit of ${formatCentavosToPHP(limitCents)}.`
    );
    if (!auth.success) {
      setError(
        auth.cancelled
          ? 'Authorization cancelled. The limit was not changed.'
          : auth.error || 'Authorization failed.'
      );
      return;
    }

    setBusy(true);
    try {
      const result = await retryStepUp(
        () => setCardDailyLimit(supabase, card.id, limitCents, card),
        promptTotp
      );
      if (result.error) throw result.error;
      if (mountedRef.current) {
        setCard((current) => ({
          ...current,
          daily_limit_cents: result.data?.daily_limit_cents ?? limitCents,
        }));
        toast.show('Daily limit updated');
      }
    } catch (err) {
      if (mountedRef.current) setError(toUserMessage(err));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [authorize, card, limitInput, promptTotp, toast]);

  const handleReplace = useCallback(() => {
    showConfirmation({
      title: 'Replace this card?',
      message:
        'Your current simulated card will stop working. A new card is issued by the server.',
      confirmLabel: 'Replace card',
      cancelLabel: 'Keep card',
      destructive: true,
      onConfirm: async () => {
        setError(null);
        const auth = await authorize(
          'Replace card',
          'Confirm that you want to replace this simulated card.'
        );
        if (!auth.success) {
          setError(
            auth.cancelled
              ? 'Authorization cancelled. The card was not replaced.'
              : auth.error || 'Authorization failed.'
          );
          return;
        }
        setBusy(true);
        try {
          const result = await retryStepUp(() => replaceCard(supabase), promptTotp);
          if (result.error) throw result.error;
          if (mountedRef.current) {
            setRevealed(null);
            setCard((current) => ({ ...current, status: 'replaced' }));
            toast.show('Card replaced. Return to Cards to see your new card.');
          }
        } catch (err) {
          if (mountedRef.current) setError(toUserMessage(err));
        } finally {
          if (mountedRef.current) setBusy(false);
        }
      },
    });
  }, [authorize, promptTotp, showConfirmation, toast]);

  const statusLabel = useMemo(() => {
    if (card.status === 'frozen') return 'Frozen';
    if (card.status === 'replaced') return 'Replaced';
    if (card.status === 'closed') return 'Closed';
    return 'Active';
  }, [card.status]);

  return (
    <FeatureScreen title="Card details" isProcessing={busy}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Card variant="primary" style={styles.cardArt}>
          <Text
            variant="caption"
            color={colors.textInverse}
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
          >
            Davao Bank debit (simulation)
          </Text>
          <Text
            variant="amount"
            color={colors.textInverse}
            tabularNums
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={styles.maskedNumber}
          >
            •••• {card.masked_last4}
          </Text>
          <View style={styles.cardArtFooter}>
            <Text
              variant="caption"
              color={colors.textInverse}
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
            >
              Expires {card.expiry_month}/{card.expiry_year}
            </Text>
            <Badge
              label={statusLabel}
              variant={card.status === 'active' ? 'success' : 'neutral'}
            />
          </View>
        </Card>

        {error ? (
          <View
            testID="card-detail-error"
            style={styles.errorBox}
            accessibilityRole="alert"
          >
            <AlertCircle size={18} color={colors.redText} />
            <Text
              variant="body"
              color={colors.redText}
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
            >
              {error}
            </Text>
            <StepUpSetupLink error={error} onClose={() => setError(null)} />
          </View>
        ) : null}

        <Card style={styles.sectionCard}>
          <Text variant="h2">Card number</Text>
          {revealed ? (
            <View testID="revealed-card-secrets">
              <Text variant="title" tabularNums maxFontSizeMultiplier={TEXT_MAX_SCALE}>
                {groupPan(revealed.pan)}
              </Text>
              <Text variant="body" tabularNums maxFontSizeMultiplier={TEXT_MAX_SCALE}>
                CVV {revealed.cvv} · Expires {revealed.expiry}
              </Text>
              <Text
                variant="caption"
                color={colors.textMuted}
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
              >
                Hidden automatically after 30 seconds. Never share these details.
              </Text>
              <Button
                title="Hide card details"
                variant="secondary"
                onPress={hideSecrets}
                icon={<EyeOff size={18} color={colors.primary} />}
              />
            </View>
          ) : (
            <Button
              title="Show card details"
              variant="secondary"
              loading={busy}
              disabled={card.status === 'replaced' || card.status === 'closed'}
              onPress={() => void handleReveal()}
              icon={<Eye size={18} color={colors.primary} />}
            />
          )}
        </Card>

        <Card style={styles.sectionCard}>
          <Text variant="h2">Controls</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={APPLE_WALLET_BUTTON_LABEL}
            onPress={() => setWalletVisible(true)}
            style={styles.controlRow}
          >
            <Text variant="bodyStrong">{APPLE_WALLET_BUTTON_LABEL}</Text>
          </Pressable>
          <ListHairline />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              card.status === 'frozen' ? 'Unfreeze card' : 'Freeze card'
            }
            onPress={() => void handleFreeze()}
            disabled={busy || card.status === 'replaced' || card.status === 'closed'}
            style={styles.controlRow}
          >
            <Snowflake size={18} color={colors.primary} />
            <Text variant="bodyStrong">
              {card.status === 'frozen' ? 'Unfreeze card' : 'Freeze card'}
            </Text>
          </Pressable>
          <ListHairline />
          <View style={styles.switchRow}>
            <Text variant="bodyStrong">Online purchases</Text>
            <Switch
              accessibilityLabel="Online purchases"
              value={card.online_purchases_enabled}
              onValueChange={() => void handleOnlinePurchases()}
              disabled={busy}
            />
          </View>
        </Card>

        <Card style={styles.sectionCard}>
          <Text variant="h2">Daily limit</Text>
          <Text
            variant="caption"
            color={colors.textSecondary}
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
          >
            Remaining today{' '}
            {formatCentavosToPHP(card.remaining_card_day_spend_cents ?? 0)}
          </Text>
          <TextField
            label="Daily card limit"
            value={limitInput}
            onChangeText={setLimitInput}
            keyboardType="numeric"
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            helperText="The card limit cannot exceed the bank's ₱5,000,000.00 ceiling."
          />
          <Button
            title="Save daily limit"
            variant="secondary"
            loading={busy}
            onPress={() => void handleDailyLimit()}
          />
        </Card>

        <Button
          title="Replace card"
          variant="destructive"
          loading={busy}
          disabled={card.status === 'replaced' || card.status === 'closed'}
          onPress={handleReplace}
          icon={<RefreshCw size={18} color={colors.redText} />}
        />
      </ScrollView>
      <AppleWalletInfoSheet
        visible={walletVisible}
        onClose={() => setWalletVisible(false)}
      />
      {confirmSheet}
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  cardArt: {
    minHeight: 176,
    justifyContent: 'space-between',
  },
  maskedNumber: {
    marginVertical: spacing.lg,
  },
  cardArtFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionCard: {
    gap: spacing.md,
  },
  errorBox: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.tintRed,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 44,
  },
});
