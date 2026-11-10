import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Check, Wallet } from 'lucide-react-native';
import {
  colors,
  formatCentavosToPHP,
  radius,
  spacing,
  type AccountBalance,
} from '@davao-bank/shared';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { AmountText } from './AmountText';
import { Pressable } from './Pressable';

/** 40 pt icon disc; rows are separated by hairlines inset 16 + 40 + 16 = 72. */
const DISC_SIZE = 40;
const ICON_SIZE = 20;
const HAIRLINE_INSET = spacing.base + DISC_SIZE + spacing.base;

/**
 * Accounts are always written "Savings •• 8921": the type from the account in
 * sentence case, then the last 4 digits.
 */
export function formatAccountLabel(
  account: Pick<AccountBalance, 'type' | 'account_number'>
) {
  const rawType = account.type ? String(account.type) : 'account';
  const typeLabel =
    rawType.charAt(0).toLocaleUpperCase() + rawType.slice(1).toLowerCase();
  const last4 = account.account_number ? account.account_number.slice(-4) : '••••';
  return `${typeLabel} •• ${last4}`;
}

export interface AccountPickerSheetProps {
  visible: boolean;
  accounts: AccountBalance[];
  selectedAccountId: string | null;
  hideBalance: boolean;
  onSelect: (accountId: string) => void;
  onClose: () => void;
  title?: string;
}

export function AccountPickerSheet({
  visible,
  accounts,
  selectedAccountId,
  hideBalance,
  onSelect,
  onClose,
  title = 'Choose account',
}: AccountPickerSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.group}>
        {accounts.map((account, index) => {
          const label = formatAccountLabel(account);
          const selected = account.account_id === selectedAccountId;
          const balanceLabel = hideBalance
            ? 'balance hidden'
            : formatCentavosToPHP(account.balance);
          return (
            <Pressable
              key={account.account_id}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${balanceLabel}`}
              accessibilityState={{ selected }}
              feedbackType="highlight"
              onPress={() => onSelect(account.account_id)}
              style={styles.row}
            >
              <View style={[styles.disc, selected && styles.discSelected]}>
                <Wallet
                  size={ICON_SIZE}
                  color={selected ? colors.textInverse : colors.primary}
                />
              </View>
              <View style={styles.rowText}>
                <Text variant="bodyStrong" color={colors.ink} numberOfLines={1}>
                  {label}
                </Text>
                <AmountText
                  amountCentavos={account.balance}
                  hidden={hideBalance}
                  variant="caption"
                  color={colors.textSecondary}
                  showSign={false}
                  maxFontSizeMultiplier={1.4}
                />
              </View>
              <View style={styles.check}>
                {selected ? <Check size={ICON_SIZE} color={colors.primary} /> : null}
              </View>
              {index < accounts.length - 1 ? <View style={styles.hairline} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    minHeight: DISC_SIZE + spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  disc: {
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discSelected: {
    backgroundColor: colors.primary,
  },
  rowText: {
    flex: 1,
  },
  check: {
    width: ICON_SIZE,
    alignItems: 'flex-end',
  },
  hairline: {
    position: 'absolute',
    left: HAIRLINE_INSET,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
