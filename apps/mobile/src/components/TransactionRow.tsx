import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import {
  ArrowDownLeft,
  ArrowUpRight,
  PlusCircle,
  MinusCircle,
  RotateCcw,
  Sliders,
  Receipt,
} from 'lucide-react-native';
import { colors, radius, spacing, type TransactionHistoryItem } from '@davao-bank/shared';
import { Text } from './Text';
import { AmountText } from './AmountText';
import { Badge } from './Badge';

export interface TransactionRowProps {
  transaction: TransactionHistoryItem;
  onPress?: () => void;
  hideBalance?: boolean;
}

export function TransactionRow({
  transaction,
  onPress,
  hideBalance = false,
}: TransactionRowProps) {
  const isCredit = transaction.direction === 'credit';
  const isReversed = transaction.status === 'reversed';

  // Format short title & subtitle per Proposal §A.4
  const getDisplayDetails = () => {
    switch (transaction.type) {
      case 'deposit':
        return {
          title: 'Cash-in',
          subtitle: transaction.reference ? `Ref: ${transaction.reference}` : 'Deposit',
          icon: <PlusCircle size={22} color={colors.green} />,
          iconBg: colors.tintBlue,
        };
      case 'withdrawal':
        return {
          title: 'Cash-out',
          subtitle: transaction.reference
            ? `Ref: ${transaction.reference}`
            : 'Withdrawal',
          icon: <MinusCircle size={22} color={colors.orange} />,
          iconBg: colors.tintOrange,
        };
      case 'transfer':
        if (isCredit) {
          return {
            title: 'Transfer in',
            subtitle: transaction.counterparty_account_number
              ? `From ${transaction.counterparty_account_number}`
              : `Ref: ${transaction.reference || 'Transfer'}`,
            icon: <ArrowDownLeft size={22} color={colors.primary} />,
            iconBg: colors.primaryTint,
          };
        } else {
          return {
            title: 'Transfer out',
            subtitle: transaction.counterparty_account_number
              ? `To ${transaction.counterparty_account_number}`
              : `Ref: ${transaction.reference || 'Transfer'}`,
            icon: <ArrowUpRight size={22} color={colors.ink} />,
            iconBg: colors.surfaceSubtle,
          };
        }
      case 'reversal':
        return {
          title: 'Reversal',
          subtitle: transaction.reference || 'Admin adjustment',
          icon: <RotateCcw size={22} color={colors.redText} />,
          iconBg: colors.tintRed,
        };
      case 'adjustment':
        return {
          title: 'Adjustment',
          subtitle: transaction.reference || 'Balance correction',
          icon: <Sliders size={22} color={colors.blueText} />,
          iconBg: colors.tintBlue,
        };
      default:
        return {
          title: transaction.type,
          subtitle: transaction.reference || 'Transaction',
          icon: <Receipt size={22} color={colors.ink} />,
          iconBg: colors.surfaceSubtle,
        };
    }
  };

  const { title, subtitle, icon, iconBg } = getDisplayDetails();

  // Format time
  const timeStr = new Date(transaction.created_at).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={!onPress}
      style={styles.container}
    >
      <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>{icon}</View>

      <View style={styles.detailsContainer}>
        <View style={styles.topRow}>
          <Text variant="bodyStrong" color={colors.ink} numberOfLines={1}>
            {title}
          </Text>
          <AmountText
            amountCentavos={transaction.amount}
            direction={isCredit ? 'incoming' : 'outgoing'}
            variant="bodyStrong"
            hidden={hideBalance}
            showSign
          />
        </View>

        <View style={styles.bottomRow}>
          <Text
            variant="caption"
            color={colors.textSecondary}
            numberOfLines={1}
            style={styles.subtitle}
          >
            {subtitle} · {timeStr}
          </Text>
          {isReversed ? <Badge label="REVERSED" variant="danger" /> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  detailsContainer: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subtitle: {
    flex: 1,
    marginRight: spacing.sm,
  },
});
