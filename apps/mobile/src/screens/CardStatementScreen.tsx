import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AlertCircle, Wallet } from 'lucide-react-native';
import {
  colors,
  formatCentavosToPHP,
  generateIdempotencyKey,
  payCardBill,
  phpToCentavos,
  radius,
  spacing,
  toUserMessage,
  type CardPaymentResult,
} from '@davao-bank/shared';
import type { RootStackParamList } from '../../App';
import { useSettings } from '../context/SettingsContext';
import { useTotpPrompt } from '../context/PasswordPromptContext';
import { useFeatureAccounts } from '../hooks/useFeatureAccounts';
import { isConfirmationRequired } from '../hooks/usePhase8Contracts';
import { useRiskChallenge } from '../hooks/useRiskChallenge';
import { supabase } from '../lib/supabase';
import { retryStepUp } from '../utils/stepUpRetry';
import {
  AccountPickerSheet,
  AmountInput,
  Button,
  Card,
  EmptyState,
  FeatureScreen,
  ListHairline,
  Pressable,
  ReviewCard,
  ServiceResult,
  StepUpSetupLink,
  Text,
  useToast,
  formatAccountLabel,
} from '../components';

const TEXT_MAX_SCALE = 1.4;
const BILLER_NAME = 'Davao Bank Card (simulation)';

type Step = 'entry' | 'result';

function readableReference(reference: string): string {
  if (!reference) return '';
  return /^db-/i.test(reference) ? reference : reference;
}

export function CardStatementScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'CardStatement'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { statement, creditCard } = route.params;
  const { hideBalance, confirmBiometricPayment } = useSettings();
  const promptTotp = useTotpPrompt();
  const { accounts, accountsLoading, accountError, loadAccounts } = useFeatureAccounts();
  const { triggerChallenge, challengeSheet, isChallengeActive } = useRiskChallenge();
  const toast = useToast();

  const initialAmount = (statement.amount_due_cents / 100).toFixed(2);
  const [amountInput, setAmountInput] = useState(initialAmount);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountPickerVisible, setAccountPickerVisible] = useState(false);
  const [step, setStep] = useState<Step>('entry');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CardPaymentResult | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.account_id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  );

  const amountCents = phpToCentavos(amountInput);
  const amountValid =
    Number.isInteger(amountCents) &&
    amountCents > 0 &&
    amountCents <= statement.amount_due_cents;

  const resetIdempotencyKey = useCallback(() => {
    idempotencyKeyRef.current = null;
  }, []);

  const getKey = useCallback(() => {
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = generateIdempotencyKey('card-bill');
    }
    return idempotencyKeyRef.current;
  }, []);

  const performPayment = useCallback(async () => {
    if (!selectedAccount || !amountValid) return;
    const idempotencyKey = getKey();
    setBusy(true);
    setError(null);
    try {
      const response = await retryStepUp(
        () =>
          payCardBill(supabase, {
            fromAccountId: selectedAccount.account_id,
            billerId: creditCard.biller_id,
            reference: statement.payment_reference,
            amountCents,
            idempotencyKey,
          }),
        promptTotp
      );
      if (response.error) throw response.error;
      if (response.data) {
        setResult(response.data);
        setStep('result');
        toast.show('Card payment completed');
      }
    } catch (err) {
      if (isConfirmationRequired(err)) {
        triggerChallenge({
          idempotencyKey,
          amount: amountCents,
          onRetry: () => void performPayment(),
        });
        return;
      }
      setError(
        toUserMessage(err, {
          availableBalance: selectedAccount.balance,
          context: 'money',
        })
      );
    } finally {
      setBusy(false);
    }
  }, [
    amountCents,
    amountValid,
    creditCard.biller_id,
    getKey,
    promptTotp,
    selectedAccount,
    statement.payment_reference,
    toast,
    triggerChallenge,
  ]);

  const handlePay = useCallback(async () => {
    setError(null);
    if (!selectedAccount) {
      setError('Choose an account to pay from.');
      return;
    }
    if (!amountValid) {
      setError(
        `Enter an amount between ₱0.01 and ${formatCentavosToPHP(statement.amount_due_cents)}.`
      );
      return;
    }

    const auth = await confirmBiometricPayment({
      title: 'Authorize card payment',
      message: `Confirm payment of ${formatCentavosToPHP(amountCents)} to ${BILLER_NAME}`,
    });
    if (!auth.success) {
      setError(
        auth.cancelled
          ? 'Not authorized. Nothing was sent.'
          : auth.error || 'Payment authorization failed.'
      );
      return;
    }
    await performPayment();
  }, [
    amountCents,
    amountValid,
    confirmBiometricPayment,
    performPayment,
    statement.amount_due_cents,
  ]);

  const hiddenAmount = (cents: number) =>
    hideBalance ? '—' : formatCentavosToPHP(cents);

  if (step === 'result' && result) {
    return (
      <FeatureScreen title="Card statement">
        <ServiceResult
          title="Card payment complete"
          subtitle="Your simulated card statement was paid."
          details={[
            { label: 'Paid', value: formatCentavosToPHP(result.amountCents) },
            { label: 'Paid to', value: BILLER_NAME },
            ...(result.reference
              ? [{ label: 'Reference', value: readableReference(result.reference) }]
              : []),
          ]}
          onDone={() => navigation.goBack()}
        />
        {challengeSheet}
      </FeatureScreen>
    );
  }

  return (
    <FeatureScreen title="Card statement" isProcessing={busy || isChallengeActive}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.statementCard}>
          <Text variant="h2">Statement</Text>
          <DetailRow
            label="Statement period"
            value={`${statement.period_start} to ${statement.period_end}`}
          />
          <DetailRow label="Due date" value={statement.due_date} />
          <DetailRow label="Total due" value={hiddenAmount(statement.total_due_cents)} />
          <DetailRow label="Already paid" value={hiddenAmount(statement.paid_cents)} />
          <DetailRow
            label="Amount due"
            value={hiddenAmount(statement.amount_due_cents)}
          />
          <DetailRow
            label="Minimum due"
            value={hiddenAmount(statement.minimum_due_cents)}
          />
          <DetailRow
            label="Statement reference"
            value={readableReference(statement.payment_reference)}
          />
        </Card>

        {error ? (
          <View
            testID="card-payment-error"
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

        {accountError ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Text variant="body" color={colors.redText}>
              {accountError}
            </Text>
            <Button
              title="Try again"
              variant="secondary"
              onPress={() => void loadAccounts()}
            />
          </View>
        ) : null}

        <Card style={styles.paymentCard}>
          <Text variant="h2">Pay card bill</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Pay from ${selectedAccount ? formatAccountLabel(selectedAccount) : 'Choose account'}`}
            onPress={() => setAccountPickerVisible(true)}
            style={styles.accountRow}
          >
            <Wallet size={18} color={colors.primary} />
            <View style={styles.accountText}>
              <Text variant="caption" color={colors.textSecondary}>
                Pay from
              </Text>
              <Text variant="bodyStrong">
                {selectedAccount ? formatAccountLabel(selectedAccount) : 'Choose account'}
              </Text>
            </View>
          </Pressable>
          <ListHairline />
          <AmountInput
            value={amountInput}
            onChangeText={(text) => {
              setAmountInput(text);
              resetIdempotencyKey();
            }}
            label="Payment amount"
            presetChips={[
              statement.minimum_due_cents / 100,
              statement.amount_due_cents / 100,
            ]}
            availableBalanceCentavos={selectedAccount?.balance}
            helperText="Pay the minimum or the full amount due. No interest is charged in this simulation."
          />
          {statement.amount_due_cents <= 0 ? (
            <EmptyState
              title="Nothing to pay"
              description="This simulated statement is already paid."
            />
          ) : (
            <>
              <ReviewCard
                eyebrow="You're paying"
                amountCentavos={amountValid ? amountCents : 0}
                rows={[
                  { label: 'To', value: BILLER_NAME },
                  {
                    label: 'Statement',
                    value: readableReference(statement.payment_reference),
                  },
                  {
                    label: 'From',
                    value: selectedAccount
                      ? formatAccountLabel(selectedAccount)
                      : 'Choose account',
                  },
                ]}
              />
              <Button
                title={`Pay ${formatCentavosToPHP(amountValid ? amountCents : 0)}`}
                onPress={() => void handlePay()}
                disabled={
                  !amountValid || accountsLoading || accounts.length === 0 || busy
                }
                loading={busy}
              />
            </>
          )}
        </Card>
      </ScrollView>
      <AccountPickerSheet
        visible={accountPickerVisible}
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        hideBalance={hideBalance}
        onSelect={(accountId) => {
          setSelectedAccountId(accountId);
          resetIdempotencyKey();
          setAccountPickerVisible(false);
        }}
        onClose={() => setAccountPickerVisible(false)}
        title="Choose account"
      />
      {challengeSheet}
    </FeatureScreen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text
        variant="body"
        color={colors.textSecondary}
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
      >
        {label}
      </Text>
      <Text variant="bodyStrong" maxFontSizeMultiplier={TEXT_MAX_SCALE}>
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
  statementCard: {
    gap: spacing.sm,
  },
  paymentCard: {
    gap: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  errorBox: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.tintRed,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
  },
  accountText: {
    gap: 2,
  },
});
