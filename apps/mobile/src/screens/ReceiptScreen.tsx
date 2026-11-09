import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';
import {
  colors,
  spacing,
  radius,
  typography,
  typeLabel,
  fetchTransactionHistory,
  toUserMessage,
  RECEIPT_NOT_FOUND_MESSAGE,
  type TransactionHistoryItem,
} from '@davao-bank/shared';
import {
  FeatureScreen,
  Skeleton,
  Text,
  AmountText,
  Badge,
  Button,
  Card,
} from '../components';

const SKELETON_HEIGHT = spacing['3xl'] * 4;

export function ReceiptScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Receipt'>>();
  const { hideBalance } = useSettings();
  const [transaction, setTransaction] = useState<TransactionHistoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setTransaction(null);
    setError(null);
    void fetchTransactionHistory(supabase, params.accountId).then(({ data, error }) => {
      if (!active) return;
      if (error) setError(toUserMessage(error));
      else {
        const match = data?.find((item) => item.transaction_id === params.transactionId);
        if (match) setTransaction(match);
        else setError(RECEIPT_NOT_FOUND_MESSAGE);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [params.transactionId, params.accountId, attempt]);

  if (loading || !transaction)
    return (
      <FeatureScreen title="Receipt">
        {loading ? (
          <Skeleton width="100%" height={SKELETON_HEIGHT} />
        ) : (
          <>
            <Text accessibilityRole="alert">{error}</Text>
            {error !== RECEIPT_NOT_FOUND_MESSAGE ? (
              <Button
                title="Try again"
                onPress={() => setAttempt((value) => value + 1)}
              />
            ) : null}
          </>
        )}
      </FeatureScreen>
    );

  const isCredit = transaction.direction === 'credit';
  const isReversed = transaction.status === 'reversed';

  const formattedDate = new Date(transaction.created_at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const getBadgeVariant = () => {
    if (isReversed) return 'danger';
    switch (transaction.status) {
      case 'completed':
        return 'success';
      case 'failed':
        return 'danger';
      default:
        return 'warning';
    }
  };

  return (
    <FeatureScreen title="Receipt" contentContainerStyle={styles.container}>
      {/* Amount Hero */}
      <View style={styles.heroBox}>
        <Text variant="caption" color={colors.textMuted} style={styles.typeLabel}>
          {typeLabel(transaction.type)}
        </Text>
        <AmountText
          amountCentavos={transaction.amount}
          direction={isCredit ? 'incoming' : 'outgoing'}
          variant="display"
          hidden={hideBalance}
          style={styles.heroAmount}
        />
        <Badge
          label={
            isReversed
              ? 'Reversed'
              : transaction.status === 'completed'
                ? 'Completed'
                : transaction.status === 'failed'
                  ? 'Failed'
                  : 'Pending'
          }
          variant={getBadgeVariant()}
          style={styles.statusBadge}
        />
      </View>

      {/* Ledger Details Card */}
      <Card variant="subtle" style={styles.detailsCard}>
        <View style={styles.row}>
          <Text variant="body" color={colors.textSecondary}>
            Account
          </Text>
          <Text variant="bodyStrong" tabularNums color={colors.ink}>
            {transaction.account_number}
          </Text>
        </View>

        {transaction.counterparty_account_number ? (
          <View style={styles.row}>
            <Text variant="body" color={colors.textSecondary}>
              Counterparty Account
            </Text>
            <Text variant="bodyStrong" tabularNums color={colors.ink}>
              {transaction.counterparty_account_number}
            </Text>
          </View>
        ) : null}

        {transaction.reference ? (
          <View style={styles.row}>
            <Text variant="body" color={colors.textSecondary}>
              Reference / Note
            </Text>
            <Text variant="bodyStrong" color={colors.ink} style={styles.refText}>
              {transaction.reference}
            </Text>
          </View>
        ) : null}

        <View style={styles.row}>
          <Text variant="body" color={colors.textSecondary}>
            Timestamp
          </Text>
          <Text variant="caption" color={colors.ink}>
            {formattedDate}
          </Text>
        </View>

        <View style={styles.row}>
          <Text variant="body" color={colors.textSecondary}>
            Transaction ID
          </Text>
          <Text variant="caption" color={colors.textMuted} style={styles.idText}>
            {transaction.transaction_id}
          </Text>
        </View>
      </Card>

      <Button
        title="Done"
        variant="secondary"
        onPress={() => navigation.goBack()}
        style={styles.doneButton}
      />
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xl,
    gap: spacing.base,
  },
  heroBox: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  typeLabel: {
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  heroAmount: {
    marginVertical: spacing.xs,
  },
  statusBadge: {
    marginTop: spacing.xs,
  },
  detailsCard: {
    padding: spacing.base,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
  },
  refText: {
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  idText: {
    fontSize: typography.caption.fontSize,
  },
  doneButton: {
    marginTop: spacing.md,
    width: '100%',
  },
});
