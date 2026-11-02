import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  colors,
  spacing,
  radius,
  formatCentavosToPHP,
  phpToCentavos,
  generateDavaoBankQRPayload,
  type AccountBalance,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { AmountInput } from '../../components/AmountInput';
import { Badge } from '../../components/Badge';

interface MyQRTabProps {
  accounts: AccountBalance[];
  selectedAccountIndex: number;
  onSelectAccountIndex: (index: number) => void;
}

export function MyQRTab({
  accounts,
  selectedAccountIndex,
  onSelectAccountIndex,
}: MyQRTabProps) {
  const [customAmountStr, setCustomAmountStr] = useState('');
  const [customNote, setCustomNote] = useState('');
  const [showOptions, setShowOptions] = useState(false);

  const selectedAccount = accounts[selectedAccountIndex] || accounts[0];

  const qrPayload = selectedAccount
    ? generateDavaoBankQRPayload({
        accountNumber: selectedAccount.account_number,
        amountCentavos:
          customAmountStr && phpToCentavos(customAmountStr) > 0
            ? phpToCentavos(customAmountStr)
            : undefined,
        note: customNote.trim() || undefined,
      })
    : '';

  return (
    <View style={styles.myQrContainer}>
      {/* Account Selector Chips if user has multiple accounts */}
      {accounts.length > 1 && (
        <View style={styles.accountSelector}>
          <Text variant="caption" color={colors.textSecondary}>
            Select receiving account:
          </Text>
          <View style={styles.accountPills}>
            {accounts.map((acc, index) => (
              <TouchableOpacity
                key={acc.account_id}
                onPress={() => onSelectAccountIndex(index)}
                style={[
                  styles.accountPill,
                  selectedAccountIndex === index && styles.accountPillActive,
                ]}
              >
                <Text
                  variant="caption"
                  color={selectedAccountIndex === index ? colors.textInverse : colors.ink}
                  style={{ fontWeight: '700' }}
                >
                  {acc.type.toUpperCase()} ({acc.account_number.slice(-4)})
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* QR Code Canvas Card */}
      <View style={styles.qrCard}>
        {selectedAccount && qrPayload ? (
          <View style={styles.qrWrapper}>
            <QRCode
              value={qrPayload}
              size={200}
              color={colors.primary}
              backgroundColor={colors.surface}
            />
          </View>
        ) : (
          <Text variant="body" color={colors.textSecondary}>
            No active account available
          </Text>
        )}

        <View style={styles.qrDetails}>
          <Text variant="caption" color={colors.textSecondary}>
            ACCOUNT NUMBER
          </Text>
          <Text variant="h2" color={colors.ink} tabularNums>
            {selectedAccount?.account_number || '—'}
          </Text>
          {customAmountStr ? (
            <Text variant="bodyStrong" color={colors.primary}>
              {formatCentavosToPHP(phpToCentavos(customAmountStr))}
            </Text>
          ) : null}
          {customNote ? (
            <Text variant="caption" color={colors.textSecondary}>
              "{customNote}"
            </Text>
          ) : null}
        </View>

        <View style={styles.davaoNotice}>
          <Badge label="Davao Bank users only" variant="neutral" />
        </View>
      </View>

      {/* Set Amount & Note Toggle */}
      <TouchableOpacity
        onPress={() => setShowOptions((prev) => !prev)}
        style={styles.optionsToggle}
        activeOpacity={0.7}
      >
        <Text variant="bodyStrong" color={colors.primary}>
          {showOptions ? 'Hide custom amount & note' : '+ Add custom amount or note'}
        </Text>
      </TouchableOpacity>

      {showOptions && (
        <View style={styles.optionsForm}>
          <AmountInput
            label="Requested Amount (Optional)"
            value={customAmountStr}
            onChangeText={setCustomAmountStr}
          />
          <TextField
            label="Payment Note (Optional)"
            value={customNote}
            onChangeText={setCustomNote}
            placeholder="e.g. Lunch split, Fruit box"
            maxLength={60}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  myQrContainer: {
    alignItems: 'center',
    gap: spacing.base,
  },
  accountSelector: {
    width: '100%',
    gap: spacing.xs,
  },
  accountPills: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  accountPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  qrCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  qrWrapper: {
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  qrDetails: {
    marginTop: spacing.base,
    alignItems: 'center',
    gap: spacing.xs,
  },
  davaoNotice: {
    marginTop: spacing.md,
  },
  optionsToggle: {
    paddingVertical: spacing.xs,
  },
  optionsForm: {
    width: '100%',
    gap: spacing.base,
    padding: spacing.base,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
  },
});
