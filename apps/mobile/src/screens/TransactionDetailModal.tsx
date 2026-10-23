import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import {
  colors,
  formatCentavosToPHP,
  type TransactionHistoryItem,
} from '@davao-bank/shared';

interface TransactionDetailModalProps {
  visible: boolean;
  onClose: () => void;
  transaction: TransactionHistoryItem | null;
}

export function TransactionDetailModal({
  visible,
  onClose,
  transaction,
}: TransactionDetailModalProps) {
  if (!transaction) return null;

  const isCredit = transaction.signed_amount > 0;
  const isTransfer = transaction.type === 'transfer';

  // Format date readable
  const formattedDate = new Date(transaction.created_at).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return colors.success;
      case 'failed':
      case 'cancelled':
        return colors.error;
      default:
        return colors.warning;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Transaction Details</Text>
              <Text style={styles.subtitle}>Official Digital Bank Receipt</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close transaction details"
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.contentBody}>
            {/* Hero Amount & Direction */}
            <View style={styles.heroBox}>
              <Text style={styles.typeTag}>{transaction.type.toUpperCase()}</Text>
              <Text
                style={[
                  styles.heroAmount,
                  { color: isCredit ? colors.success : colors.textPrimary },
                ]}
              >
                {isCredit ? '+' : ''}
                {formatCentavosToPHP(transaction.signed_amount)}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(transaction.status) + '20' },
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    { color: getStatusColor(transaction.status) },
                  ]}
                >
                  ● {transaction.status.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Receipt Table */}
            <View style={styles.receiptContainer}>
              <View style={styles.receiptRow}>
                <Text style={styles.label}>Account Number</Text>
                <Text style={styles.value}>{transaction.account_number}</Text>
              </View>

              {isTransfer && (
                <View style={styles.receiptRow}>
                  <Text style={styles.label}>
                    {isCredit ? 'Sender Account' : 'Recipient Account'}
                  </Text>
                  <Text style={styles.valueHighlight}>
                    {transaction.counterparty_account_number || 'Internal'}
                  </Text>
                </View>
              )}

              <View style={styles.receiptRow}>
                <Text style={styles.label}>Direction</Text>
                <Text style={styles.value}>
                  {transaction.direction === 'credit'
                    ? 'Cash In / Inflow'
                    : 'Cash Out / Outflow'}
                </Text>
              </View>

              <View style={styles.receiptRow}>
                <Text style={styles.label}>Reference / Note</Text>
                <Text style={styles.value}>
                  {transaction.reference || 'None provided'}
                </Text>
              </View>

              <View style={styles.receiptRow}>
                <Text style={styles.label}>Date & Time</Text>
                <Text style={styles.value}>{formattedDate}</Text>
              </View>

              <View style={styles.receiptRow}>
                <Text style={styles.label}>Transaction ID</Text>
                <Text style={styles.monoValue} numberOfLines={1} ellipsizeMode="middle">
                  {transaction.transaction_id}
                </Text>
              </View>

              <View style={styles.receiptRow}>
                <Text style={styles.label}>Ledger Entry ID</Text>
                <Text style={styles.monoValue} numberOfLines={1} ellipsizeMode="middle">
                  {transaction.ledger_entry_id}
                </Text>
              </View>
            </View>

            {/* Verification note */}
            <View style={styles.securityBox}>
              <Text style={styles.securityText}>
                🔒 Verified by Davao Bank Double-Entry Core Ledger. Balances are
                server-authoritative and immutable.
              </Text>
            </View>

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Done</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  contentBody: {
    gap: 16,
    paddingBottom: 24,
  },
  heroBox: {
    backgroundColor: colors.surfaceHover,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  typeTag: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1,
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  receiptContainer: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  value: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    maxWidth: '55%',
    textAlign: 'right',
  },
  valueHighlight: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },
  monoValue: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.textSecondary,
    maxWidth: '50%',
    textAlign: 'right',
  },
  securityBox: {
    backgroundColor: colors.surfaceHover,
    borderRadius: 12,
    padding: 12,
  },
  securityText: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
    textAlign: 'center',
  },
  closeButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  closeButtonText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
});
