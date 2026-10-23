import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import {
  FileText,
  FileSpreadsheet,
  Calendar,
  Check,
  ChevronDown,
  AlertCircle,
} from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  formatCentavosToPHP,
  type AccountBalance,
  type AccountStatement,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { BottomSheet, Text, Button, Card, Chip, TextField } from '../components';

interface ExportStatementModalProps {
  visible: boolean;
  onClose: () => void;
  accounts: AccountBalance[];
  defaultAccountId?: string;
}

type PeriodOption = 'this_month' | 'last_month' | 'last_3_months' | 'custom';

export function ExportStatementModal({
  visible,
  onClose,
  accounts,
  defaultAccountId,
}: ExportStatementModalProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    defaultAccountId || accounts[0]?.account_id || ''
  );
  const [period, setPeriod] = useState<PeriodOption>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingCsv, setLoadingCsv] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAccount =
    accounts.find((a) => a.account_id === selectedAccountId) || accounts[0];

  const calculateDateRange = (): { from: string; to: string } => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toYMD = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (period === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toYMD(firstDay), to: toYMD(now) };
    } else if (period === 'last_month') {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toYMD(firstDayLastMonth), to: toYMD(lastDayLastMonth) };
    } else if (period === 'last_3_months') {
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return { from: toYMD(threeMonthsAgo), to: toYMD(now) };
    } else {
      return { from: customFrom.trim(), to: customTo.trim() };
    }
  };

  const fetchStatementData = async (): Promise<AccountStatement> => {
    const { from, to } = calculateDateRange();
    if (!from || !to) {
      throw new Error('Please specify both start date and end date (YYYY-MM-DD)');
    }

    const { data, error: rpcErr } = await supabase.rpc('get_account_statement', {
      p_account_id: selectedAccount.account_id,
      p_from: from,
      p_to: to,
    });

    if (rpcErr) {
      throw new Error(rpcErr.message);
    }
    if (!data) {
      throw new Error('No statement data returned from server');
    }

    return data as AccountStatement;
  };

  const handleExportPDF = async () => {
    try {
      setLoadingPdf(true);
      setError(null);

      const statement = await fetchStatementData();
      const generatedAt = new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const txRowsHtml = statement.transactions
        .map((tx) => {
          const dateStr = new Date(tx.created_at).toLocaleDateString('en-US', {
            timeZone: 'Asia/Manila',
            month: 'short',
            day: 'numeric',
          });
          const sign = tx.direction === 'credit' ? '+' : '−';
          const color = tx.direction === 'credit' ? colors.primary : colors.ink;
          const counterparty = tx.counterparty_account_number
            ? `Account ${tx.counterparty_account_number}`
            : '—';

          return `
            <tr style="border-bottom: 1px solid ${colors.border};">
              <td style="padding: 10px 8px; font-size: 13px;">${dateStr}</td>
              <td style="padding: 10px 8px; font-size: 13px; text-transform: capitalize; font-weight: 600;">${tx.type}</td>
              <td style="padding: 10px 8px; font-size: 13px; color: ${colors.textSecondary};">${tx.reference || '—'}</td>
              <td style="padding: 10px 8px; font-size: 13px; color: ${colors.textSecondary};">${counterparty}</td>
              <td style="padding: 10px 8px; font-size: 13px; text-align: right; font-weight: 700; font-family: monospace; color: ${color};">
                ${sign}${formatCentavosToPHP(tx.amount)}
              </td>
            </tr>
          `;
        })
        .join('');

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Davao Bank Statement - ${statement.account_number}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 30px; color: ${colors.ink}; line-height: 1.4; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${colors.primary}; padding-bottom: 20px; margin-bottom: 25px; }
            .logo-title { font-size: 26px; font-weight: 800; color: ${colors.primary}; letter-spacing: -0.5px; }
            .logo-subtitle { font-size: 12px; color: ${colors.textSecondary}; text-transform: uppercase; letter-spacing: 1px; }
            .meta-box { text-align: right; font-size: 13px; color: ${colors.textSecondary}; }
            .summary-cards { display: flex; gap: 15px; margin-bottom: 25px; }
            .card { flex: 1; background: ${colors.canvas}; border-radius: 12px; padding: 15px; border: 1px solid ${colors.border}; }
            .card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: ${colors.textSecondary}; font-weight: 700; }
            .card-value { font-size: 20px; font-weight: 800; margin-top: 5px; font-family: monospace; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { text-align: left; padding: 10px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: ${colors.textSecondary}; border-bottom: 2px solid ${colors.border}; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid ${colors.border}; font-size: 11px; color: ${colors.textMuted}; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo-title">DAVAO BANK</div>
              <div class="logo-subtitle">Official Account Statement</div>
            </div>
            <div class="meta-box">
              <div><strong>Account Number:</strong> ${statement.account_number}</div>
              <div><strong>Period:</strong> ${statement.period_from} to ${statement.period_to}</div>
              <div><strong>Generated:</strong> ${generatedAt} (Asia/Manila)</div>
            </div>
          </div>

          <div class="summary-cards">
            <div class="card">
              <div class="card-label">Opening Balance</div>
              <div class="card-value">${formatCentavosToPHP(statement.opening_balance)}</div>
            </div>
            <div class="card">
              <div class="card-label">Closing Balance</div>
              <div class="card-value" style="color: ${colors.primary};">${formatCentavosToPHP(statement.closing_balance)}</div>
            </div>
            <div class="card">
              <div class="card-label">Total Transactions</div>
              <div class="card-value">${statement.transactions.length}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Reference</th>
                <th>Counterparty</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${
                statement.transactions.length > 0
                  ? txRowsHtml
                  : `<tr><td colspan="5" style="text-align: center; padding: 25px; color: ${colors.textMuted};">No transactions recorded in this period.</td></tr>`
              }
            </tbody>
          </table>

          <div class="footer">
            <p><strong>Disclaimer:</strong> Davao Bank is a simulated prototype for academic use. It is not a licensed bank and holds no real money.</p>
            <p>Kadayawan logo used with permission of the Davao City Tourism Operations Office.</p>
          </div>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          UTI: '.pdf',
          mimeType: 'application/pdf',
        });
      } else {
        Alert.alert('Statement Ready', `Generated PDF statement at: ${uri}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to export PDF';
      setError(msg);
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      setLoadingCsv(true);
      setError(null);

      const statement = await fetchStatementData();

      // Build CSV content
      const headers = [
        'Transaction ID',
        'Date (UTC)',
        'Type',
        'Direction',
        'Amount (Centavos)',
        'Amount (PHP)',
        'Status',
        'Reference',
        'Counterparty Account',
      ];

      const rows = statement.transactions.map((tx) => [
        `"${tx.transaction_id}"`,
        `"${tx.created_at}"`,
        `"${tx.type}"`,
        `"${tx.direction}"`,
        tx.amount,
        `"${(tx.amount / 100).toFixed(2)}"`,
        `"${tx.status}"`,
        `"${(tx.reference || '').replace(/"/g, '""')}"`,
        `"${tx.counterparty_account_number || ''}"`,
      ]);

      const metadataRows = [
        `# Davao Bank Account Statement`,
        `# Account Number: ${statement.account_number}`,
        `# Period: ${statement.period_from} to ${statement.period_to}`,
        `# Opening Balance: ${(statement.opening_balance / 100).toFixed(2)} PHP`,
        `# Closing Balance: ${(statement.closing_balance / 100).toFixed(2)} PHP`,
        `# Generated At: ${new Date().toISOString()}`,
        '',
      ];

      const csvContent = `${metadataRows.join('\n')}${headers.join(',')}\n${rows.map((r) => r.join(',')).join('\n')}`;

      // Write to cache directory and share
      const fileUri = `${FileSystem.cacheDirectory}DavaoBank_Statement_${statement.account_number}_${statement.period_from}_${statement.period_to}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          UTI: 'public.comma-separated-values-text',
          mimeType: 'text/csv',
        });
      } else {
        Alert.alert('Statement Ready', `Generated CSV statement at: ${fileUri}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to export CSV';
      setError(msg);
    } finally {
      setLoadingCsv(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Account Statement">
      <ScrollView contentContainerStyle={styles.container}>
        <Text variant="caption" color={colors.textSecondary} style={styles.subtitle}>
          Generate an official reconciled statement with opening & closing balances.
        </Text>

        {/* Account Selector */}
        {accounts.length > 1 && (
          <View style={styles.section}>
            <Text variant="label" color={colors.ink} style={styles.sectionTitle}>
              Select Account
            </Text>
            <View style={styles.accountRow}>
              {accounts.map((acc) => {
                const isSelected = acc.account_id === selectedAccount.account_id;
                return (
                  <Chip
                    key={acc.account_id}
                    label={`${acc.type} · ${acc.account_number.slice(-4)}`}
                    selected={isSelected}
                    onPress={() => setSelectedAccountId(acc.account_id)}
                  />
                );
              })}
            </View>
          </View>
        )}

        {/* Period Selector */}
        <View style={styles.section}>
          <Text variant="label" color={colors.ink} style={styles.sectionTitle}>
            Statement Period
          </Text>
          <View style={styles.chipGrid}>
            <Chip
              label="This Month"
              selected={period === 'this_month'}
              onPress={() => setPeriod('this_month')}
            />
            <Chip
              label="Last Month"
              selected={period === 'last_month'}
              onPress={() => setPeriod('last_month')}
            />
            <Chip
              label="Last 3 Months"
              selected={period === 'last_3_months'}
              onPress={() => setPeriod('last_3_months')}
            />
            <Chip
              label="Custom Range"
              selected={period === 'custom'}
              onPress={() => setPeriod('custom')}
            />
          </View>

          {period === 'custom' && (
            <View style={styles.customDateContainer}>
              <TextField
                label="Start Date (YYYY-MM-DD)"
                placeholder="2026-01-01"
                value={customFrom}
                onChangeText={setCustomFrom}
                containerStyle={styles.dateField}
              />
              <TextField
                label="End Date (YYYY-MM-DD)"
                placeholder="2026-03-31"
                value={customTo}
                onChangeText={setCustomTo}
                containerStyle={styles.dateField}
              />
            </View>
          )}
        </View>

        {/* Selected Account Summary */}
        <Card variant="subtle" style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text variant="caption" color={colors.textSecondary}>
              Account:
            </Text>
            <Text variant="bodyStrong" color={colors.ink} tabularNums>
              {selectedAccount?.account_number}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text variant="caption" color={colors.textSecondary}>
              Current Balance:
            </Text>
            <Text variant="bodyStrong" color={colors.primary} tabularNums>
              {formatCentavosToPHP(selectedAccount?.balance || 0)}
            </Text>
          </View>
        </Card>

        {error ? (
          <View style={styles.errorContainer}>
            <AlertCircle size={16} color={colors.redText} />
            <Text variant="caption" color={colors.redText} style={styles.errorText}>
              {error}
            </Text>
          </View>
        ) : null}

        {/* Export Buttons */}
        <View style={styles.buttonGroup}>
          <Button
            title="Download PDF Statement"
            variant="primary"
            icon={<FileText size={18} color={colors.textInverse} />}
            onPress={handleExportPDF}
            loading={loadingPdf}
            disabled={loadingCsv}
          />
          <Button
            title="Export CSV Spreadsheet"
            variant="secondary"
            icon={<FileSpreadsheet size={18} color={colors.ink} />}
            onPress={handleExportCSV}
            loading={loadingCsv}
            disabled={loadingPdf}
          />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xl,
  },
  subtitle: {
    marginBottom: spacing.md,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  accountRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  chipGrid: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  customDateContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dateField: {
    flex: 1,
    marginBottom: 0,
  },
  summaryCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.tintRed,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    flex: 1,
  },
  buttonGroup: {
    gap: spacing.sm,
  },
});
