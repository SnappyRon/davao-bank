import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Check, Wallet } from 'lucide-react-native';
import { colors, formatCentavosToPHP, type AccountBalance } from '@davao-bank/shared';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { AmountText } from './AmountText';
import { Pressable } from './Pressable';
import { LIST_ICON_SIZE, groupedListStyles } from './GroupedList';

/** 40 pt icon disc; hairlines inset 72 from the shared list metrics. */
const ICON_SIZE = LIST_ICON_SIZE;

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
      <View style={groupedListStyles.group}>
        {accounts.map((account, index) => {
          const label = formatAccountLabel(account);
          const selected = account.account_id === selectedAccountId;
          const balanceLabel = hideBalance
            ? 'amount hidden'
            : formatCentavosToPHP(account.balance);
          return (
            <Pressable
              key={account.account_id}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${balanceLabel}`}
              accessibilityState={{ selected }}
              feedbackType="highlight"
              onPress={() => onSelect(account.account_id)}
              style={groupedListStyles.row}
            >
              <View style={[groupedListStyles.disc, selected && styles.discSelected]}>
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
              {index < accounts.length - 1 ? (
                <View style={groupedListStyles.hairlineAbsolute} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  discTint: {
    backgroundColor: colors.primaryTint,
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
});
