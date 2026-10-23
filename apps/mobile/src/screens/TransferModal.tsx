import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import {
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Send,
  Users,
  BookmarkCheck,
  UserCheck,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  colors,
  spacing,
  radius,
  formatCentavosToPHP,
  phpToCentavos,
  generateIdempotencyKey,
  executeTransfer,
  type AccountBalance,
  type MoneyOperationResult,
  type SavedRecipient,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';
import {
  BottomSheet,
  Text,
  TextField,
  AmountInput,
  Button,
  Card,
  AmountText,
  Chip,
} from '../components';

interface TransferModalProps {
  visible: boolean;
  onClose: () => void;
  accounts: AccountBalance[];
  onTransferSuccess: (result: MoneyOperationResult) => void;
}

type TransferStep = 'recipient' | 'amount' | 'review' | 'success';
type RecipientTab = 'saved' | 'my_accounts' | 'new';

export function TransferModal({
  visible,
  onClose,
  accounts,
  onTransferSuccess,
}: TransferModalProps) {
  const { hideBalance, confirmBiometricPayment } = useSettings();

  const [step, setStep] = useState<TransferStep>('recipient');
  const [recipientTab, setRecipientTab] = useState<RecipientTab>('saved');
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    accounts[0]?.account_id || ''
  );
  const [recipientAccountNumber, setRecipientAccountNumber] = useState('');
  const [recipientNickname, setRecipientNickname] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [reference, setReference] = useState('');

  // Save recipient checkbox for new numbers
  const [shouldSaveRecipient, setShouldSaveRecipient] = useState(false);
  const [saveNickname, setSaveNickname] = useState('');

  // Saved recipients
  const [savedRecipients, setSavedRecipients] = useState<SavedRecipient[]>([]);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<MoneyOperationResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const selectedAccount =
    accounts.find((a) => a.account_id === selectedAccountId) || accounts[0];

  const otherAccounts = accounts.filter(
    (a) => a.account_id !== selectedAccount?.account_id
  );

  const loadSavedRecipients = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('saved_recipients')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) {
        setSavedRecipients(data);
        if (data.length === 0 && otherAccounts.length > 0) {
          setRecipientTab('my_accounts');
        } else if (data.length === 0) {
          setRecipientTab('new');
        }
      }
    } catch {
      // Ignored
    }
  }, [otherAccounts.length]);

  useEffect(() => {
    if (visible) {
      loadSavedRecipients();
    }
  }, [visible, loadSavedRecipients]);

  const resetState = () => {
    setStep('recipient');
    setRecipientAccountNumber('');
    setRecipientNickname('');
    setAmountStr('');
    setReference('');
    setShouldSaveRecipient(false);
    setSaveNickname('');
    setErrorMessage(null);
    setSuccessResult(null);
    setIdempotencyKey('');
    onClose();
  };

  const handleSelectOwnAccount = (acc: AccountBalance) => {
    setRecipientAccountNumber(acc.account_number);
    setRecipientNickname(`${acc.type.toUpperCase()} (${acc.account_number.slice(-4)})`);
    setErrorMessage(null);
    setStep('amount');
  };

  const handleSelectSavedRecipient = (rec: SavedRecipient) => {
    setRecipientAccountNumber(rec.account_number);
    setRecipientNickname(rec.nickname);
    setErrorMessage(null);
    setStep('amount');
  };

  const handleNextFromRecipient = () => {
    setErrorMessage(null);
    const cleaned = recipientAccountNumber.trim();
    if (!cleaned) {
      setErrorMessage('Please enter or select an account number');
      return;
    }
    if (selectedAccount && cleaned === selectedAccount.account_number) {
      setErrorMessage('Cannot transfer to the same account');
      return;
    }
    setStep('amount');
  };

  const handleNextFromAmount = () => {
    setErrorMessage(null);
    const centavos = phpToCentavos(amountStr);
    if (centavos <= 0) {
      setErrorMessage('Amount must be greater than ₱0.00');
      return;
    }
    if (selectedAccount && centavos > selectedAccount.balance) {
      setErrorMessage('Insufficient funds in selected source account');
      return;
    }

    // Generate idempotency key once per attempt
    if (!idempotencyKey) {
      setIdempotencyKey(generateIdempotencyKey('transfer'));
    }
    setStep('review');
  };

  const handleConfirmTransfer = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    setErrorMessage(null);

    const centavos = phpToCentavos(amountStr);

    // 1. Biometric confirmation before money moves (§B.4)
    const bioResult = await confirmBiometricPayment(
      `Confirm transfer of ${formatCentavosToPHP(centavos)} to ${recipientAccountNumber}`
    );

    if (bioResult.cancelled) {
      setLoading(false);
      setErrorMessage(
        'Transfer authorization was cancelled. You can retry whenever ready.'
      );
      return;
    }

    if (bioResult.requiresPasswordFallback) {
      // Fallback: prompt for password
      Alert.prompt(
        'Security Verification',
        'Please enter your account password to authorize this transfer:',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              setLoading(false);
              setErrorMessage('Transfer authorization was cancelled.');
            },
          },
          {
            text: 'Authorize',
            onPress: async (pwd?: string) => {
              const {
                data: { user },
              } = await supabase.auth.getUser();
              if (!user?.email || !pwd) {
                setLoading(false);
                setErrorMessage('Password is required to authorize transfer.');
                return;
              }
              const { error: authErr } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: pwd,
              });
              if (authErr) {
                setLoading(false);
                setErrorMessage('Incorrect password. Transfer rejected.');
                return;
              }
              // Proceed with transfer
              await executeServerTransfer(centavos);
            },
          },
        ],
        'secure-text'
      );
      return;
    }

    await executeServerTransfer(centavos);
  };

  const executeServerTransfer = async (centavos: number) => {
    if (!selectedAccount) return;

    const { data, error } = await executeTransfer(supabase, {
      from_account: selectedAccount.account_id,
      to_account_number: recipientAccountNumber.trim(),
      amount: centavos,
      idempotency_key: idempotencyKey,
      reference: reference.trim() || 'Mobile Transfer',
    });

    setLoading(false);

    if (error) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {
        // Ignored
      }
      setErrorMessage(error);
    } else if (data) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // Ignored
      }

      // If user checked "Save this recipient", automatically call add_saved_recipient
      if (shouldSaveRecipient && saveNickname.trim()) {
        try {
          await supabase.rpc('add_saved_recipient', {
            p_account_number: recipientAccountNumber.trim(),
            p_nickname: saveNickname.trim(),
          });
        } catch {
          // Non-blocking if save fails
        }
      }

      setSuccessResult(data);
      setStep('success');
      onTransferSuccess(data);
    }
  };

  const centavosAmount = phpToCentavos(amountStr);

  return (
    <BottomSheet
      visible={visible}
      onClose={resetState}
      title={
        step === 'recipient'
          ? 'Transfer · Recipient'
          : step === 'amount'
            ? 'Transfer · Amount'
            : step === 'review'
              ? 'Transfer · Review'
              : 'Transfer Successful'
      }
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {errorMessage ? (
          <Card variant="subtle" style={styles.errorCard}>
            <AlertCircle size={18} color={colors.redText} />
            <Text variant="caption" color={colors.redText} style={styles.errorText}>
              {errorMessage}
            </Text>
          </Card>
        ) : null}

        {/* STEP 1: RECIPIENT */}
        {step === 'recipient' && (
          <View style={styles.stepContainer}>
            {/* Recipient Source Tabs: Saved, My Accounts, New */}
            <View style={styles.tabGrid}>
              <Chip
                label="Saved"
                selected={recipientTab === 'saved'}
                onPress={() => setRecipientTab('saved')}
              />
              {otherAccounts.length > 0 && (
                <Chip
                  label="My Accounts"
                  selected={recipientTab === 'my_accounts'}
                  onPress={() => setRecipientTab('my_accounts')}
                />
              )}
              <Chip
                label="New Account"
                selected={recipientTab === 'new'}
                onPress={() => setRecipientTab('new')}
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
                      onPress={() => setRecipientTab('new')}
                    />
                  </Card>
                ) : (
                  <View style={styles.recipientList}>
                    {savedRecipients.map((rec) => (
                      <Card
                        key={rec.id}
                        variant="elevated"
                        style={styles.recipientItem}
                        onPress={() => handleSelectSavedRecipient(rec)}
                      >
                        <View style={styles.recipientIconCircle}>
                          <Users size={16} color={colors.primary} />
                        </View>
                        <View style={styles.recipientInfo}>
                          <Text variant="bodyStrong" color={colors.ink}>
                            {rec.nickname}
                          </Text>
                          <Text
                            variant="caption"
                            color={colors.textSecondary}
                            tabularNums
                          >
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
                      onPress={() => handleSelectOwnAccount(acc)}
                    >
                      <View style={styles.recipientIconCircle}>
                        <UserCheck size={16} color={colors.primary} />
                      </View>
                      <View style={styles.recipientInfo}>
                        <Text variant="bodyStrong" color={colors.ink}>
                          {acc.type.toUpperCase()} ACCOUNT
                        </Text>
                        <Text variant="caption" color={colors.textSecondary} tabularNums>
                          {acc.account_number} · Available:{' '}
                          {formatCentavosToPHP(acc.balance)}
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
                  onChangeText={(val) => {
                    setRecipientAccountNumber(val);
                    setRecipientNickname('');
                  }}
                  placeholder="e.g. 1020441785"
                  keyboardType="number-pad"
                  maxLength={10}
                />

                <TouchableOpacity
                  style={styles.checkboxRow}
                  activeOpacity={0.7}
                  onPress={() => setShouldSaveRecipient((prev) => !prev)}
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
                    onChangeText={setSaveNickname}
                    placeholder="e.g. Davao Landlord, Sister"
                    maxLength={40}
                  />
                )}
              </View>
            )}

            {/* Source Account Info */}
            <View style={styles.sourceSelector}>
              <Text
                variant="label"
                color={colors.textSecondary}
                style={styles.fieldLabel}
              >
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
              <Button
                title="Continue"
                onPress={handleNextFromRecipient}
                style={styles.actionButton}
              />
            )}
          </View>
        )}

        {/* STEP 2: AMOUNT */}
        {step === 'amount' && (
          <View style={styles.stepContainer}>
            <AmountInput
              label="Amount to Transfer"
              value={amountStr}
              onChangeText={setAmountStr}
              presetAmounts={[100, 500, 1000, 5000]}
              helperText={`Available: ${hideBalance ? '₱••••••' : formatCentavosToPHP(selectedAccount?.balance || 0)}`}
            />

            <TextField
              label="Note / Reference (Optional)"
              value={reference}
              onChangeText={setReference}
              placeholder="e.g. Rent, Groceries"
              maxLength={60}
            />

            <View style={styles.navRow}>
              <Button
                title="Back"
                variant="ghost"
                onPress={() => setStep('recipient')}
                style={styles.backButton}
              />
              <Button
                title="Review"
                onPress={handleNextFromAmount}
                style={styles.forwardButton}
              />
            </View>
          </View>
        )}

        {/* STEP 3: REVIEW */}
        {step === 'review' && (
          <View style={styles.stepContainer}>
            <Card variant="subtle" style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <Text variant="caption" color={colors.textMuted}>
                  TOTAL AMOUNT
                </Text>
                <AmountText
                  amountCentavos={centavosAmount}
                  direction="outgoing"
                  variant="display"
                />
              </View>

              <View style={styles.reviewRow}>
                <Text variant="body" color={colors.textSecondary}>
                  From
                </Text>
                <Text variant="bodyStrong" tabularNums color={colors.ink}>
                  {selectedAccount?.account_number}
                </Text>
              </View>

              <View style={styles.reviewRow}>
                <Text variant="body" color={colors.textSecondary}>
                  To
                </Text>
                <Text variant="bodyStrong" tabularNums color={colors.ink}>
                  {recipientNickname
                    ? `${recipientNickname} (${recipientAccountNumber})`
                    : recipientAccountNumber}
                </Text>
              </View>

              {reference ? (
                <View style={styles.reviewRow}>
                  <Text variant="body" color={colors.textSecondary}>
                    Note
                  </Text>
                  <Text variant="bodyStrong" color={colors.ink}>
                    {reference}
                  </Text>
                </View>
              ) : null}

              <View style={styles.reviewRow}>
                <Text variant="body" color={colors.textSecondary}>
                  Projected Balance
                </Text>
                <AmountText
                  amountCentavos={(selectedAccount?.balance || 0) - centavosAmount}
                  hidden={hideBalance}
                  variant="bodyStrong"
                  color={colors.ink}
                  showSign={false}
                />
              </View>
            </Card>

            <View style={styles.navRow}>
              <Button
                title="Back"
                variant="ghost"
                onPress={() => setStep('amount')}
                style={styles.backButton}
              />
              <Button
                title="Authorize Transfer"
                onPress={handleConfirmTransfer}
                loading={loading}
                icon={<Send size={18} color={colors.textInverse} />}
                style={styles.forwardButton}
              />
            </View>
          </View>
        )}

        {/* STEP 4: SUCCESS */}
        {step === 'success' && successResult && (
          <View style={styles.stepContainer}>
            <View style={styles.successIconBox}>
              <CheckCircle2 size={54} color={colors.primary} />
              <Text variant="h2" align="center" style={styles.successTitle}>
                Transfer Sent
              </Text>
              <AmountText
                amountCentavos={centavosAmount}
                direction="outgoing"
                variant="display"
              />
            </View>

            <Card variant="subtle" style={styles.receiptCard}>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textMuted}>
                  Recipient
                </Text>
                <Text variant="bodyStrong" tabularNums color={colors.ink}>
                  {recipientNickname
                    ? `${recipientNickname} (${recipientAccountNumber})`
                    : recipientAccountNumber}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textMuted}>
                  Updated Balance
                </Text>
                <AmountText
                  amountCentavos={(selectedAccount?.balance || 0) - centavosAmount}
                  hidden={hideBalance}
                  variant="bodyStrong"
                  color={colors.ink}
                  showSign={false}
                />
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textMuted}>
                  Transaction ID
                </Text>
                <Text variant="caption" color={colors.textMuted} style={styles.idText}>
                  {successResult.id}
                </Text>
              </View>
            </Card>

            <Button
              title="Done"
              variant="secondary"
              onPress={resetState}
              style={styles.actionButton}
            />
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xl,
    gap: spacing.base,
  },
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
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tintRed,
    borderColor: colors.redText,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: {
    flex: 1,
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
  navRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  backButton: {
    flex: 1,
  },
  forwardButton: {
    flex: 2,
  },
  reviewCard: {
    padding: spacing.base,
    borderRadius: radius.lg,
    gap: spacing.md,
  },
  reviewHeader: {
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  successIconBox: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  successTitle: {
    marginTop: spacing.xs,
  },
  receiptCard: {
    padding: spacing.base,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  idText: {
    fontFamily: 'monospace',
    fontSize: 11,
  },
});
