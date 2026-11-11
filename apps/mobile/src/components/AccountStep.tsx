import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing, type AccountBalance } from '@davao-bank/shared';
import { Text } from './Text';
import { AccountList } from './AccountPickerSheet';

export interface AccountStepProps {
  /** "Pay from", "Add to", … */
  heading: string;
  accounts: AccountBalance[];
  selectedAccountId: string | null;
  hideBalance: boolean;
  onSelect: (accountId: string) => void;
}

/**
 * The first step of a money flow when the user has 2+ accounts (spec 7B.4):
 * choose the account the money comes from (or goes to, for Add money).
 * Flows render it only when `accounts.length >= 2`.
 */
export function AccountStep({
  heading,
  accounts,
  selectedAccountId,
  hideBalance,
  onSelect,
}: AccountStepProps) {
  return (
    <View style={styles.container}>
      <Text variant="label" color={colors.textSecondary} accessibilityRole="header">
        {heading}
      </Text>
      <AccountList
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        hideBalance={hideBalance}
        onSelect={onSelect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
});
