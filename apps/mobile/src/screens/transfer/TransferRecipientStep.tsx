import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Users, BookmarkCheck, UserCheck } from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  formatCentavosToPHP,
  type AccountBalance,
  type SavedRecipient,
  typography,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { Pressable } from '../../components/Pressable';
import { RecipientChip } from '../../components/RecipientChip';
import { formatAccountLabel } from '../../components/AccountPickerSheet';
import { maskAccountNumber } from '../../utils/transactionDisplay';

export type RecipientTab = 'saved' | 'my_accounts' | 'new';

interface TransferRecipientStepProps {
  recipientTab: RecipientTab;
  onTabChange: (tab: RecipientTab) => void;
  savedRecipients: SavedRecipient[];
  otherAccounts: AccountBalance[];
  selectedAccount: AccountBalance | undefined;
  recipientAccountNumber: string;
  onRecipientAccountChange: (acc: string) => void;
  /** Inline validation shown under the Account number field. */
  recipientError?: string | null;
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
  recipientError,
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
            label="My accounts"
            selected={recipientTab === 'my_accounts'}
            onPress={() => onTabChange('my_accounts')}
          />
        )}
        <Chip
          label="New account"
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
                title="Enter an account number"
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
                  accessibilityLabel={`${rec.nickname}, ${maskAccountNumber(rec.account_number)}`}
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
                      {maskAccountNumber(rec.account_number)}
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
            Move money between your own accounts.
          </Text>
          <View style={styles.recipientList}>
            {otherAccounts.map((acc) => (
              <Card
                key={acc.account_id}
                variant="elevated"
                style={styles.recipientItem}
                accessibilityLabel={`${formatAccountLabel(acc)}, ${hideBalance ? 'amount hidden' : formatCentavosToPHP(acc.balance)}`}
                onPress={() => onSelectOwn(acc)}
              >
                <View style={styles.recipientIconCircle}>
                  <UserCheck size={16} color={colors.primary} />
                </View>
                <View style={styles.recipientInfo}>
                  <Text variant="bodyStrong" color={colors.ink}>
                    {formatAccountLabel(acc)}
                  </Text>
                  <Text
                    variant="caption"
                    color={colors.textSecondary}
                    tabularNums
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    maxFontSizeMultiplier={1.4}
                  >
                    Available:{' '}
                    {hideBalance ? '₱••••••' : formatCentavosToPHP(acc.balance)}
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
            label="Account number"
            value={recipientAccountNumber}
            onChangeText={onRecipientAccountChange}
            placeholder="e.g. 1020441785"
            error={recipientError || undefined}
            keyboardType="number-pad"
            maxLength={10}
          />

          <Pressable
            style={styles.checkboxRow}
            feedbackType="scale"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: shouldSaveRecipient }}
            accessibilityLabel="Save this recipient for future transfers"
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
          </Pressable>

          {shouldSaveRecipient && (
            <TextField
              label="Nickname"
              value={saveNickname}
              onChangeText={onSaveNicknameChange}
              placeholder="e.g. Davao Landlord, Sister"
              maxLength={40}
            />
          )}
        </View>
      )}

      {selectedAccount ? (
        <RecipientChip label={`From ${formatAccountLabel(selectedAccount)}`} />
      ) : null}

      {recipientTab === 'new' && (
        <Button title="Continue" onPress={onContinue} style={styles.actionButton} />
      )}

      {onRequestMoneyPress && (
        <Pressable
          onPress={onRequestMoneyPress}
          style={styles.requestMoneyLink}
          feedbackType="scale"
          accessibilityRole="button"
          accessibilityLabel="Need to receive funds? Request money instead"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text
            variant="caption"
            color={colors.primary}
            style={{ fontFamily: typography.fonts.bold }}
          >
            Need to receive funds? Request money instead &rarr;
          </Text>
        </Pressable>
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
