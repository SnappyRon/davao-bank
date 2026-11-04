import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronDown, Eye, EyeOff } from 'lucide-react-native';
import { colors, radius, spacing, type AccountBalance } from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { AmountText } from '../../components/AmountText';
import { Skeleton } from '../../components/Skeleton';

interface HomeBalanceCardProps {
  loading: boolean;
  accounts: AccountBalance[];
  selectedAccountIndex: number;
  hideBalance: boolean;
  onSwitchAccount: () => void;
  onToggleHideBalance: () => void;
}

export function HomeBalanceCard({
  loading,
  accounts,
  selectedAccountIndex,
  hideBalance,
  onSwitchAccount,
  onToggleHideBalance,
}: HomeBalanceCardProps) {
  const currentAccount = accounts[selectedAccountIndex] || accounts[0];
  const accountTypeLabel = currentAccount?.type
    ? currentAccount.type.charAt(0).toUpperCase() +
      currentAccount.type.slice(1).toLowerCase()
    : 'Account';

  if (loading) {
    return <Skeleton width="100%" height={160} style={styles.cardSkeleton} />;
  }

  return (
    <View style={styles.balanceCard}>
      <View style={styles.balanceHeader}>
        <TouchableOpacity
          style={styles.accountPill}
          activeOpacity={accounts.length > 1 ? 0.7 : 1}
          onPress={onSwitchAccount}
        >
          <Text variant="caption" color={colors.textInverse}>
            {accountTypeLabel} · {currentAccount?.account_number || '•••• ••••'}
          </Text>
          {accounts.length > 1 ? (
            <ChevronDown size={14} color={colors.textInverse} />
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onToggleHideBalance}
          style={styles.eyeButton}
          activeOpacity={0.7}
          accessibilityLabel={
            hideBalance ? 'Balance hidden. Double tap to reveal' : 'Hide balance'
          }
        >
          {hideBalance ? (
            <EyeOff size={20} color={colors.textInverse} />
          ) : (
            <Eye size={20} color={colors.textInverse} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.balanceAmountContainer}>
        <Text variant="caption" color={colors.primaryTint} style={styles.balanceSubtext}>
          Available Balance
        </Text>
        <AmountText
          amountCentavos={currentAccount?.balance || 0}
          hidden={hideBalance}
          variant="display"
          color={colors.textInverse}
          showSign={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardSkeleton: {
    borderRadius: radius.xl,
    marginBottom: spacing.base,
  },
  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.base,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  eyeButton: {
    padding: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  balanceAmountContainer: {
    gap: spacing.xs,
  },
  balanceSubtext: {
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
