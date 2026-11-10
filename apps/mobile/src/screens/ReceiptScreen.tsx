import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Copy } from 'lucide-react-native';
import type { RootStackParamList } from '../../App';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';
import {
  colors,
  formatCentavosToPHP,
  formatReferenceId,
  size,
  spacing,
  radius,
  fetchTransactionHistory,
  toUserMessage,
  RECEIPT_NOT_FOUND_MESSAGE,
  type TransactionHistoryItem,
} from '@davao-bank/shared';
import {
  FeatureScreen,
  Skeleton,
  Text,
  AmountText,
  Badge,
  Button,
  Pressable,
  transactionStatusBadge,
  useToast,
} from '../components';
import { transactionNote, transactionTitle } from '../utils/transactionDisplay';

const SKELETON_HEIGHT = spacing['3xl'] * 4;
const COPY_ICON_SIZE = 18;
const AMOUNT_MAX_SCALE = 1.4;

/**
 * Reference no. shown to customers: "DB-" + the first 8 hex characters of the
 * transaction UUID, uppercased and split 4-4 ("DB-8F04-3910"). Uses the shared
 * `formatReferenceId`. The full UUID appears only in the shared receipt text.
 */
export function receiptReference(transactionId: string): string {
  return formatReferenceId(transactionId);
}

function formatReceiptDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Plain-text receipt for Share receipt; includes the full transaction id. */
export function buildReceiptText(
  tx: TransactionHistoryItem,
  options: { hideBalance: boolean }
): string {
  const isCredit = tx.direction === 'credit';
  const status = transactionStatusBadge(tx.status, 'receipt');
  const note = transactionNote(tx);
  const lines = [
    'Davao Bank receipt',
    '',
    transactionTitle(tx),
    `Amount: ${options.hideBalance ? 'Hidden' : formatCentavosToPHP(tx.amount)}`,
    status ? `Status: ${status.label}` : null,
    `Date & time: ${formatReceiptDate(tx.created_at)}`,
    tx.counterparty_account_number
      ? `${isCredit ? 'From' : 'To'}: ${tx.counterparty_account_number}`
      : null,
    note ? `Note: ${note}` : null,
    `Reference no.: ${receiptReference(tx.transaction_id)}`,
    `Transaction ID: ${tx.transaction_id}`,
    '',
    'Davao Bank is a simulated bank for academic use. No real money is involved.',
  ];
  return lines.filter((line) => line !== null).join('\n');
}

function DetailRow({
  label,
  value,
  trailing,
  last = false,
}: {
  label: string;
  value: string;
  trailing?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Text variant="body" color={colors.textSecondary}>
        {label}
      </Text>
      <View style={styles.rowValue}>
        <Text
          variant="bodyStrong"
          color={colors.ink}
          tabularNums
          style={styles.valueText}
        >
          {value}
        </Text>
        {trailing}
      </View>
    </View>
  );
}

export function ReceiptScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Receipt'>>();
  const { hideBalance } = useSettings();
  const toast = useToast();
  const [transaction, setTransaction] = useState<TransactionHistoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setTransaction(null);
    setError(null);
    setNotFound(false);
    void fetchTransactionHistory(supabase, params.accountId).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setError(toUserMessage(error));
      } else {
        const match = data?.find((item) => item.transaction_id === params.transactionId);
        if (match) {
          setTransaction(match);
        } else {
          setNotFound(true);
          setError(RECEIPT_NOT_FOUND_MESSAGE);
        }
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [params.transactionId, params.accountId, attempt]);

  if (loading || !transaction)
    return (
      <FeatureScreen title="Receipt">
        {loading ? (
          <Skeleton width="100%" height={SKELETON_HEIGHT} />
        ) : (
          <>
            <Text accessibilityRole="alert">{error}</Text>
            {!notFound ? (
              <Button
                title="Try again"
                onPress={() => setAttempt((value) => value + 1)}
              />
            ) : null}
          </>
        )}
      </FeatureScreen>
    );

  const isCredit = transaction.direction === 'credit';
  const isReversed = transaction.status === 'reversed';
  const badge = transactionStatusBadge(transaction.status, 'receipt');
  const reference = receiptReference(transaction.transaction_id);
  const note = transactionNote(transaction);

  const handleCopyReference = async () => {
    await Clipboard.setStringAsync(reference);
    toast.show('Reference copied');
  };

  const handleShare = async () => {
    setShareError(null);
    setSharing(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setShareError('Sharing is not available on this device.');
        return;
      }
      const uri = `${FileSystem.cacheDirectory}davao-bank-receipt-${reference}.txt`;
      await FileSystem.writeAsStringAsync(
        uri,
        buildReceiptText(transaction, { hideBalance })
      );
      await Sharing.shareAsync(uri, {
        mimeType: 'text/plain',
        UTI: 'public.plain-text',
        dialogTitle: 'Share receipt',
      });
    } catch (err) {
      setShareError(toUserMessage(err));
    } finally {
      setSharing(false);
    }
  };

  const rows: { label: string; value: string; trailing?: React.ReactNode }[] = [
    { label: 'Date & time', value: formatReceiptDate(transaction.created_at) },
  ];
  if (transaction.counterparty_account_number) {
    // Receipts show the full account number (spec 7B "Accounts").
    rows.push({
      label: isCredit ? 'From' : 'To',
      value: transaction.counterparty_account_number,
    });
  }
  if (note) rows.push({ label: 'Note', value: note });
  rows.push({
    label: 'Reference no.',
    value: reference,
    trailing: (
      <Pressable
        onPress={handleCopyReference}
        accessibilityRole="button"
        accessibilityLabel="Copy reference number"
        feedbackType="highlight"
        style={styles.copyButton}
      >
        <Copy size={COPY_ICON_SIZE} color={colors.primary} />
      </Pressable>
    ),
  });

  return (
    <FeatureScreen
      title="Receipt"
      contentContainerStyle={styles.container}
      footer={
        <View style={styles.footer}>
          <Button
            title="Share receipt"
            onPress={handleShare}
            loading={sharing}
            disabled={sharing}
          />
          <Button title="Done" variant="secondary" onPress={() => navigation.goBack()} />
        </View>
      }
    >
      {/* Amount and status badge, centred together */}
      <View style={styles.hero}>
        <Text variant="label" color={colors.textSecondary} align="center">
          {transactionTitle(transaction)}
        </Text>
        <AmountText
          amountCentavos={transaction.amount}
          direction={isCredit ? 'incoming' : 'outgoing'}
          color={isReversed ? colors.textMuted : undefined}
          variant="display"
          hidden={hideBalance}
          maxFontSizeMultiplier={AMOUNT_MAX_SCALE}
          style={isReversed ? styles.struck : undefined}
        />
        {badge ? (
          <Badge label={badge.label} variant={badge.variant} style={styles.centred} />
        ) : null}
      </View>

      <View style={styles.details}>
        {rows.map((row, index) => (
          <DetailRow
            key={row.label}
            label={row.label}
            value={row.value}
            trailing={row.trailing}
            last={index === rows.length - 1}
          />
        ))}
      </View>

      {shareError ? (
        <Text variant="caption" color={colors.redText} accessibilityRole="alert">
          {shareError}
        </Text>
      ) : null}
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  centred: {
    alignSelf: 'center',
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  details: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: size.control,
    paddingVertical: spacing.md,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowValue: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  valueText: {
    flexShrink: 1,
    textAlign: 'right',
  },
  copyButton: {
    minWidth: size.touch,
    minHeight: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    gap: spacing.sm,
  },
});
