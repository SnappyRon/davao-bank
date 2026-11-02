import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Users, BookmarkCheck, UserCheck, CreditCard } from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  formatCentavosToPHP,
  type AccountBalance,
  type SavedRecipient,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { AmountText } from '../../components/AmountText';
import { Chip } from '../../components/Chip';

export type RecipientTab = 'saved' | 'my_accounts' | 'new';

interface TransferRecipientStepProps {
  recipientTab: RecipientTab;
  onTabChange: (tab: RecipientTab) => void;
  savedRecipients: SavedRecipient[];
  otherAccounts: AccountBalance[];
  selectedAccount: AccountBalance | undefined;
  recipientAccountNumber: string;
  onRecipientAccountChange: (acc: string) => void;
  shouldSaveRecipient: boolean;
  onShouldSaveChange: (save: boolean) => void;
  saveNickname: string;
  onSaveNicknameChange: (name: string) => void;
  hideBalance: boolean;
  onSelectSaved: (rec: SavedRecipient) => void;
  onSelectOwn: (acc: AccountBalance) => void;
  onContinue: () => void;
  onRequestMoneyPress?: () => void;
}

export function TransferRecipientStep({
  recipientTab,
  onTabChange,
  savedRecipients,
  otherAccounts,
  selectedAccount,
  recipientAccountNumber,
  onRecipientAccountChange,
  shouldSaveRecipient,
  onShouldSaveChange,
  saveNickname,
  onSaveNicknameChange,
  hideBalance,
  onSelectSaved,
  onSelectOwn,
  onContinue,
  onRequestMoneyPress,
}: TransferRecipientStepProps) {
  return (
    <View style={styles.stepContainer}>
      {/* Recipient Source Tabs */}
      <View style={styles.tabGrid}>
        <Chip
          label="Saved"
          selected={recipientTab === 'saved'}
          onPress={() => onTabChange('saved')}
        />
        {otherAccounts.length > 0 && (
          <Chip
            label="My Accounts"
            selected={recipientTab === 'my_accounts'}
            onPress={() => onTabChange('my_accounts')}
          />
        )}
        <Chip
          label="New Account"
          selected={recipientTab === 'new'}
          onPress={() => onTabChange('new')}
        />
      </View>

      {recipientTab === 'saved' && (
        <View style={styles.tabContent}>
          {savedRecipients.length === 0 ? (
            <Card variant="subtle" style={styles.emptyCard}>
              <Text variant="caption" color={colors.textSecondary} align="center">
                No saved recipients yet. Enter a new account number below.
              </Text>
              <Button
                title="Enter New Account"
                variant="ghost"
                onPress={() => onTabChange('new')}
              />
            </Card>
          ) : (
            <View style={styles.recipientList}>
              {savedRecipients.map((rec) => (
                <Card
                  key={rec.id}
                  variant="elevated"
                  style={styles.recipientItem}
                  onPress={() => onSelectSaved(rec)}
                >
                  <View style={styles.recipientIconCircle}>
                    <Users size={16} color={colors.primary} />
                  </View>
                  <View style={styles.recipientInfo}>
                    <Text variant="bodyStrong" color={colors.ink}>
                      {rec.nickname}
                    </Text>
                    <Text variant="caption" color={colors.textSecondary} tabularNums>
                      {rec.account_number}
                    </Text>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </View>
      )}

      {recipientTab === 'my_accounts' && (
        <View style={styles.tabContent}>
          <Text variant="caption" color={colors.textSecondary}>
            Own-account shortcut — transfer funds between your Davao Bank accounts:
          </Text>
          <View style={styles.recipientList}>
            {otherAccounts.map((acc) => (
              <Card
                key={acc.account_id}
                variant="elevated"
                style={styles.recipientItem}
                onPress={() => onSelectOwn(acc)}
              >
                <View style={styles.recipientIconCircle}>
                  <UserCheck size={16} color={colors.primary} />
                </View>
                <View style={styles.recipientInfo}>
                  <Text variant="bodyStrong" color={colors.ink}>
                    {acc.type.toUpperCase()} ACCOUNT
                  </Text>
                  <Text variant="caption" color={colors.textSecondary} tabularNums>
                    {acc.account_number} · Available: {formatCentavosToPHP(acc.balance)}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        </View>
      )}

      {recipientTab === 'new' && (
        <View style={styles.tabContent}>
          <TextField
            label="Recipient Account Number"
            value={recipientAccountNumber}
            onChangeText={onRecipientAccountChange}
            placeholder="e.g. 1020441785"
            keyboardType="number-pad"
            maxLength={10}
          />

          <TouchableOpacity
            style={styles.checkboxRow}
            activeOpacity={0.7}
            onPress={() => onShouldSaveChange(!shouldSaveRecipient)}
          >
            <View
              style={[
                styles.checkboxBox,
                shouldSaveRecipient && styles.checkboxBoxChecked,
              ]}
            >
              {shouldSaveRecipient && (
                <BookmarkCheck size={14} color={colors.textInverse} />
              )}
            </View>
            <Text variant="body" color={colors.ink}>
              Save this recipient for future transfers
            </Text>
          </TouchableOpacity>

          {shouldSaveRecipient && (
            <TextField
              label="Recipient Nickname"
              value={saveNickname}
              onChangeText={onSaveNicknameChange}
              placeholder="e.g. Davao Landlord, Sister"
              maxLength={40}
            />
          )}
        </View>
      )}

      {/* Source Account Info */}
      <View style={styles.sourceSelector}>
        <Text variant="label" color={colors.textSecondary} style={styles.fieldLabel}>
          From Account
        </Text>
        <Card variant="subtle" style={styles.accountCard}>
          <CreditCard size={20} color={colors.primary} />
          <View style={styles.accountInfo}>
            <Text variant="bodyStrong" tabularNums color={colors.ink}>
              {selectedAccount?.account_number} ({selectedAccount?.type})
            </Text>
            <View style={styles.balanceRow}>
              <Text variant="caption" color={colors.textSecondary}>
                Available:{' '}
              </Text>
              <AmountText
                amountCentavos={selectedAccount?.balance || 0}
                hidden={hideBalance}
                variant="caption"
                color={colors.primary}
              />
            </View>
          </View>
        </Card>
      </View>

      {recipientTab === 'new' && (
        <Button title="Continue" onPress={onContinue} style={styles.actionButton} />
      )}

      {onRequestMoneyPress && (
        <TouchableOpacity
          onPress={onRequestMoneyPress}
          style={styles.requestMoneyLink}
          activeOpacity={0.7}
        >
          <Text variant="caption" color={colors.primary} style={{ fontWeight: '700' }}>
            Need to receive funds? Request money instead &rarr;
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stepContainer: {
    gap: spacing.base,
  },
  tabGrid: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  tabContent: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  emptyCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  recipientList: {
    gap: spacing.xs,
  },
  recipientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  recipientIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipientInfo: {
    flex: 1,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sourceSelector: {
    gap: spacing.xs,
  },
  fieldLabel: {
    marginBottom: spacing.xs,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  accountInfo: {
    flex: 1,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    marginTop: spacing.md,
    width: '100%',
  },
  requestMoneyLink: {
    marginTop: spacing.sm,
    alignItems: 'center',
    padding: spacing.xs,
  },
});
