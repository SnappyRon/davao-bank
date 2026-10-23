import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import {
  ArrowDownLeft,
  ArrowUpRight,
  PlusCircle,
  MinusCircle,
  RotateCcw,
  Sliders,
  Receipt,
  Clock,
  Hash,
} from 'lucide-react-native';
import { colors, spacing, radius, type TransactionHistoryItem } from '@davao-bank/shared';
import { BottomSheet, Text, AmountText, Badge, Button, Card } from '../components';

interface TransactionDetailModalProps {
  visible: boolean;
  onClose: () => void;
  transaction: TransactionHistoryItem | null;
}

export function TransactionDetailModal({
  visible,
  onClose,
  transaction,
}: TransactionDetailModalProps) {
  if (!transaction) return null;

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
    <BottomSheet visible={visible} onClose={onClose} title="Receipt">
      <ScrollView contentContainerStyle={styles.container}>
        {/* Amount Hero */}
        <View style={styles.heroBox}>
          <Text variant="caption" color={colors.textMuted} style={styles.typeLabel}>
            {transaction.type.toUpperCase()}
          </Text>
          <AmountText
            amountCentavos={transaction.amount}
            direction={isCredit ? 'incoming' : 'outgoing'}
            variant="display"
            style={styles.heroAmount}
          />
          <Badge
            label={transaction.status.toUpperCase()}
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
          onPress={onClose}
          style={styles.doneButton}
        />
      </ScrollView>
    </BottomSheet>
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
    fontFamily: 'monospace',
    fontSize: 11,
  },
  doneButton: {
    marginTop: spacing.md,
    width: '100%',
  },
});
