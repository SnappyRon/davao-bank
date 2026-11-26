import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import {
  ArrowDownLeft,
  ArrowUpRight,
  PlusCircle,
  MinusCircle,
  RotateCcw,
  Sliders,
  Receipt,
} from 'lucide-react-native';
import {
  colors,
  formatCentavosToPHP,
  type TransactionHistoryItem,
} from '@davao-bank/shared';
import { useSettings } from '../context/SettingsContext';
import {
  counterpartyPhrase,
  formatRowTime,
  transactionNote,
  transactionTitle,
} from '../utils/transactionDisplay';
import { Text } from './Text';
import { AmountText } from './AmountText';
import { Badge, transactionStatusBadge } from './Badge';
import { Pressable } from './Pressable';
import { LIST_ICON_SIZE, groupedListStyles } from './GroupedList';

/** Amounts cap text scaling at 1.4 (spec 7B.6). */
const AMOUNT_MAX_SCALE = 1.4;

export interface TransactionRowProps {
  transaction: TransactionHistoryItem;
  onPress?: () => void;
  /**
   * The original transaction a reversal row reverses, when it is loaded.
   * Turns the title into "Reversal · Transfer to •• 8720".
   */
  reversalOf?: TransactionHistoryItem | null;
  /** Account prefix for the meta line (Activity): "Savings · To •• 7943". */
  accountLabel?: string;
  /** Container overrides. */
  style?: StyleProp<ViewStyle>;
}

function rowIcon(item: TransactionHistoryItem): { icon: React.ReactNode; bg: string } {
  const isCredit = item.direction === 'credit';
  switch (item.type) {
    case 'deposit':
      return {
        icon: <PlusCircle size={LIST_ICON_SIZE} color={colors.primary} />,
        bg: colors.primaryTint,
      };
    case 'withdrawal':
      return {
        icon: <MinusCircle size={LIST_ICON_SIZE} color={colors.orangeText} />,
        bg: colors.tintOrange,
      };
    case 'transfer':
      return isCredit
        ? {
            icon: <ArrowDownLeft size={LIST_ICON_SIZE} color={colors.primary} />,
            bg: colors.primaryTint,
          }
        : {
            icon: <ArrowUpRight size={LIST_ICON_SIZE} color={colors.blueText} />,
            bg: colors.tintBlue,
          };
    case 'bill_payment':
      return {
        icon: <Receipt size={LIST_ICON_SIZE} color={colors.orangeText} />,
        bg: colors.tintOrange,
      };
    case 'reversal':
      return {
        icon: <RotateCcw size={LIST_ICON_SIZE} color={colors.textSecondary} />,
        bg: colors.surfaceSubtle,
      };
    case 'adjustment':
      return {
        icon: <Sliders size={LIST_ICON_SIZE} color={colors.blueText} />,
        bg: colors.tintBlue,
      };
    default:
      return {
        icon: <Receipt size={LIST_ICON_SIZE} color={colors.ink} />,
        bg: colors.surfaceSubtle,
      };
  }
}

/**
 * Spec 7B.2 transaction row: minHeight 64, padding 12×16, 40 pt disc, title
 * (`bodyStrong`) over the meta line (caption, muted), amount (`bodyStrong`,
 * tabular) on the right. The row reads `hideBalance` itself.
 */
export function TransactionRow({
  transaction,
  onPress,
  reversalOf,
  accountLabel,
  style,
}: TransactionRowProps) {
  const { hideBalance } = useSettings();
  const isCredit = transaction.direction === 'credit';
  const isReversed = transaction.status === 'reversed';

  const title = transactionTitle(transaction, reversalOf);
  const time = formatRowTime(transaction.created_at);
  const detail = counterpartyPhrase(transaction) ?? transactionNote(transaction);
  const meta = [accountLabel, detail, time].filter(Boolean).join(' · ');

  const badge = transactionStatusBadge(transaction.status, 'list');
  const { icon, bg } = rowIcon(transaction);

  const amountLabel = hideBalance
    ? 'amount hidden'
    : `${isCredit ? 'plus' : 'minus'} ${formatCentavosToPHP(transaction.amount)}`;
  const a11yLabel = [title, meta, amountLabel, badge?.label].filter(Boolean).join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      feedbackType="highlight"
      onPress={onPress}
      disabled={!onPress}
      style={[groupedListStyles.row, styles.container, style]}
    >
      <View style={[groupedListStyles.disc, styles.disc, { backgroundColor: bg }]}>
        {icon}
      </View>

      <View style={styles.main}>
        <View style={styles.rowTop}>
          <Text
            variant="bodyStrong"
            color={colors.ink}
            numberOfLines={1}
            style={styles.title}
          >
            {title}
          </Text>
          <View style={styles.trailing}>
            <AmountText
              amountCentavos={transaction.amount}
              direction={isCredit ? 'incoming' : 'outgoing'}
              color={isReversed ? colors.textMuted : undefined}
              variant="bodyStrong"
              hidden={hideBalance}
              maxFontSizeMultiplier={AMOUNT_MAX_SCALE}
              style={isReversed ? styles.struck : undefined}
            />
            {badge ? (
              <Badge label={badge.label} variant={badge.variant} style={styles.badge} />
            ) : null}
          </View>
        </View>
        {meta ? (
          <Text
            variant="caption"
            color={colors.textMuted}
            numberOfLines={1}
            style={styles.meta}
          >
            {meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
  },
  disc: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  main: {
    flex: 1,
    gap: 2,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  title: {
    flex: 1,
    minWidth: 120,
  },
  meta: {
    marginTop: 2,
  },
  trailing: {
    alignItems: 'flex-end',
    flexShrink: 0,
    alignSelf: 'flex-end',
  },
  badge: {
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
});
