import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import {
  Zap,
  Droplet,
  Wifi,
  Smartphone,
  Layers,
  Search,
  CheckCircle2,
  Calendar,
  CreditCard,
  AlertCircle,
  Clock,
  Repeat,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  colors,
  spacing,
  radius,
  formatCentavosToPHP,
  phpToCentavos,
  generateIdempotencyKey,
  type AccountBalance,
  type Biller,
  type BillerCategory,
  type ScheduledPaymentFrequency,
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
  Badge,
} from '../components';

interface PayBillsModalProps {
  visible: boolean;
  onClose: () => void;
  accounts: AccountBalance[];
  onPaymentSuccess: () => void;
}

type Step = 'biller' | 'reference' | 'amount' | 'when' | 'review' | 'success';
type PaymentTiming = 'now' | 'later' | 'recurring';

export function PayBillsModal({
  visible,
  onClose,
  accounts,
  onPaymentSuccess,
}: PayBillsModalProps) {
  const { hideBalance, confirmBiometricPayment } = useSettings();

  const [step, setStep] = useState<Step>('biller');
  const [billers, setBillers] = useState<Biller[]>([]);
  const [selectedBiller, setSelectedBiller] = useState<Biller | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [reference, setReference] = useState('');
  const [refError, setRefError] = useState<string | null>(null);

  const [amountStr, setAmountStr] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    accounts[0]?.account_id || ''
  );

  // When / Scheduling options
  const [timing, setTiming] = useState<PaymentTiming>('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [frequency, setFrequency] = useState<ScheduledPaymentFrequency>('monthly');
  const [maxRunsStr, setMaxRunsStr] = useState('');
  const [endDate, setEndDate] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [receiptTxId, setReceiptTxId] = useState<string | null>(null);

  const selectedAccount =
    accounts.find((a) => a.account_id === selectedAccountId) || accounts[0];

  useEffect(() => {
    if (visible) {
      loadBillers();
      resetForm();
    }
  }, [visible]);

  const resetForm = () => {
    setStep('biller');
    setSelectedBiller(null);
    setSelectedCategory('all');
    setSearchQuery('');
    setReference('');
    setRefError(null);
    setAmountStr('');
    setTiming('now');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setScheduledDate(tomorrow.toISOString().split('T')[0]);
    setFrequency('monthly');
    setMaxRunsStr('12');
    setEndDate('');
    setLoading(false);
    setErrorMessage(null);
    setIdempotencyKey(generateIdempotencyKey('bill_payment'));
  };

  const loadBillers = async () => {
    try {
      const { data, error } = await supabase
        .from('billers')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (data && !error) {
        setBillers(data as Biller[]);
      }
    } catch {
      // Fallback
    }
  };

  const filteredBillers = billers.filter((b) => {
    const matchesCategory =
      selectedCategory === 'all' || b.category === selectedCategory;
    const matchesSearch =
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.reference_label.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCategoryIcon = (category: BillerCategory) => {
    switch (category) {
      case 'electricity':
        return <Zap size={20} color={colors.yellow} />;
      case 'water':
        return <Droplet size={20} color={colors.blue} />;
      case 'internet':
        return <Wifi size={20} color={colors.primary} />;
      case 'mobile':
        return <Smartphone size={20} color={colors.orange} />;
      default:
        return <Layers size={20} color={colors.textSecondary} />;
    }
  };

  const validateReference = (val: string): boolean => {
    if (!selectedBiller) return false;
    const clean = val.trim();
    if (!clean) {
      setRefError(`${selectedBiller.reference_label} is required`);
      return false;
    }
    try {
      const regex = new RegExp(selectedBiller.reference_pattern);
      if (!regex.test(clean)) {
        setRefError(`Format doesn't match requirement (Pattern: ${selectedBiller.reference_pattern})`);
        return false;
      }
    } catch {
      // Invalid regex pattern fallback
    }
    setRefError(null);
    return true;
  };

  const centavos = phpToCentavos(amountStr || '0');
  const availableCentavos = selectedAccount?.balance || 0;
  const isAmountValid = centavos > 0 && centavos <= availableCentavos;

  const handleSelectBiller = (biller: Biller) => {
    setSelectedBiller(biller);
    setReference('');
    setRefError(null);
    setStep('reference');
  };

  const handleReferenceContinue = () => {
    if (validateReference(reference)) {
      setStep('amount');
    }
  };

  const handleAmountContinue = () => {
    if (isAmountValid) {
      setStep('when');
    }
  };

  const handleWhenContinue = () => {
    setErrorMessage(null);
    setStep('review');
  };

  const handleSubmitPayment = async () => {
    if (!selectedBiller || !selectedAccount) return;

    setLoading(true);
    setErrorMessage(null);

    // 1. Biometric verification before moving money
    const authenticated = await confirmBiometricPayment(
      timing === 'now'
        ? `Confirm payment of ${formatCentavosToPHP(centavos)} to ${selectedBiller.name}`
        : `Confirm scheduling payment of ${formatCentavosToPHP(centavos)} to ${selectedBiller.name}`
    );

    if (!authenticated) {
      setLoading(false);
      return;
    }

    try {
      if (timing === 'now') {
        // Immediate bill payment
        const { data, error } = await supabase.rpc('pay_bill', {
          p_from_account: selectedAccount.account_id,
          p_biller_id: selectedBiller.id,
          p_biller_reference: reference.trim(),
          p_amount: centavos,
          p_idempotency_key: idempotencyKey,
        });

        if (error) {
          throw new Error(error.message);
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setReceiptTxId(data?.id || null);
        setStep('success');
        onPaymentSuccess();
      } else {
        // Scheduled or Recurring bill payment
        const maxRuns = timing === 'recurring' && maxRunsStr ? parseInt(maxRunsStr, 10) : null;
        const { error } = await supabase.rpc('create_scheduled_payment', {
          p_from_account: selectedAccount.account_id,
          p_kind: 'bill',
          p_to_account: null,
          p_biller_id: selectedBiller.id,
          p_biller_reference: reference.trim(),
          p_amount: centavos,
          p_frequency: timing === 'recurring' ? frequency : 'once',
          p_start_date: scheduledDate,
          p_end_date: endDate || null,
          p_max_runs: maxRuns,
          p_note: `Bill: ${selectedBiller.name}`,
        });

        if (error) {
          throw new Error(error.message);
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setStep('success');
        onPaymentSuccess();
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage(err?.message || 'Payment execution failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={
        step === 'biller'
          ? 'Pay Bills'
          : step === 'reference'
          ? 'Account Details'
          : step === 'amount'
          ? 'Enter Amount'
          : step === 'when'
          ? 'Payment Schedule'
          : step === 'review'
          ? 'Review Payment'
          : 'Payment Result'
      }
    >
      <ScrollView contentContainerStyle={styles.content}>
        {/* Step 1: Biller Selection */}
        {step === 'biller' && (
          <View style={styles.stepContainer}>
            <TextField
              placeholder="Search biller or utility..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              accessibilityLabel="Search billers"
            />

            {/* Category Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryChips}
            >
              {[
                { id: 'all', label: 'All' },
                { id: 'electricity', label: 'Electricity' },
                { id: 'water', label: 'Water' },
                { id: 'internet', label: 'Internet' },
                { id: 'mobile', label: 'Mobile' },
              ].map((cat) => (
                <Chip
                  key={cat.id}
                  label={cat.label}
                  selected={selectedCategory === cat.id}
                  onPress={() => setSelectedCategory(cat.id)}
                />
              ))}
            </ScrollView>

            <View style={styles.billerList}>
              {filteredBillers.map((biller) => (
                <TouchableOpacity
                  key={biller.id}
                  style={styles.billerRow}
                  onPress={() => handleSelectBiller(biller)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${biller.name}`}
                >
                  <View style={styles.billerIconContainer}>
                    {getCategoryIcon(biller.category)}
                  </View>
                  <View style={styles.billerTextContainer}>
                    <Text variant="bodyStrong">{biller.name}</Text>
                    <Text variant="caption" color="textSecondary">
                      {biller.reference_label}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}

              {filteredBillers.length === 0 && (
                <View style={styles.emptyContainer}>
                  <Text variant="body" color="textMuted">
                    No billers found in this category.
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Step 2: Reference Number */}
        {step === 'reference' && selectedBiller && (
          <View style={styles.stepContainer}>
            <Card style={styles.billerHeaderCard}>
              <View style={styles.billerCardRow}>
                <View style={styles.billerIconContainer}>
                  {getCategoryIcon(selectedBiller.category)}
                </View>
                <View style={styles.billerTextContainer}>
                  <Text variant="title">{selectedBiller.name}</Text>
                  <Badge variant="neutral" label={selectedBiller.category} />
                </View>
              </View>
            </Card>

            <TextField
              label={selectedBiller.reference_label}
              value={reference}
              onChangeText={(val) => {
                setReference(val);
                if (refError) validateReference(val);
              }}
              placeholder={`Enter ${selectedBiller.reference_label.toLowerCase()}`}
              error={refError || undefined}
              helperText={`Required pattern: ${selectedBiller.reference_pattern}`}
              keyboardType="default"
              autoFocus
            />

            <View style={styles.buttonRow}>
              <Button
                title="Back"
                variant="ghost"
                onPress={() => setStep('biller')}
                style={styles.halfButton}
              />
              <Button
                title="Continue"
                variant="primary"
                onPress={handleReferenceContinue}
                disabled={!reference.trim()}
                style={styles.halfButton}
              />
            </View>
          </View>
        )}

        {/* Step 3: Amount */}
        {step === 'amount' && (
          <View style={styles.stepContainer}>
            <AmountInput
              value={amountStr}
              onChangeText={setAmountStr}
              availableBalanceCentavos={availableCentavos}
              error={
                centavos > availableCentavos
                  ? 'Amount exceeds available balance'
                  : undefined
              }
            />

            <View style={styles.buttonRow}>
              <Button
                title="Back"
                variant="ghost"
                onPress={() => setStep('reference')}
                style={styles.halfButton}
              />
              <Button
                title="Continue"
                variant="primary"
                onPress={handleAmountContinue}
                disabled={!isAmountValid}
                style={styles.halfButton}
              />
            </View>
          </View>
        )}

        {/* Step 4: When (Now / Later / Recurring) */}
        {step === 'when' && (
          <View style={styles.stepContainer}>
            <Text variant="label" style={styles.sectionHeader}>
              Choose Payment Timing
            </Text>

            <TouchableOpacity
              style={[
                styles.timingOption,
                timing === 'now' && styles.timingOptionActive,
              ]}
              onPress={() => setTiming('now')}
            >
              <Zap size={22} color={timing === 'now' ? colors.primary : colors.textSecondary} />
              <View style={styles.timingTextContainer}>
                <Text variant="bodyStrong">Pay Now</Text>
                <Text variant="caption" color="textSecondary">
                  Execute payment immediately
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.timingOption,
                timing === 'later' && styles.timingOptionActive,
              ]}
              onPress={() => setTiming('later')}
            >
              <Calendar size={22} color={timing === 'later' ? colors.primary : colors.textSecondary} />
              <View style={styles.timingTextContainer}>
                <Text variant="bodyStrong">Schedule for Later</Text>
                <Text variant="caption" color="textSecondary">
                  Pay once on a future date
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.timingOption,
                timing === 'recurring' && styles.timingOptionActive,
              ]}
              onPress={() => setTiming('recurring')}
            >
              <Repeat size={22} color={timing === 'recurring' ? colors.primary : colors.textSecondary} />
              <View style={styles.timingTextContainer}>
                <Text variant="bodyStrong">Recurring Payment</Text>
                <Text variant="caption" color="textSecondary">
                  Repeat weekly or monthly automatically
                </Text>
              </View>
            </TouchableOpacity>

            {timing !== 'now' && (
              <View style={styles.scheduleConfigBox}>
                <TextField
                  label="Execution Date (YYYY-MM-DD)"
                  value={scheduledDate}
                  onChangeText={setScheduledDate}
                  placeholder="YYYY-MM-DD"
                  helperText="Date when the payment will execute (Asia/Manila time)"
                />

                {timing === 'recurring' && (
                  <>
                    <Text variant="label" style={styles.configLabel}>
                      Frequency
                    </Text>
                    <View style={styles.freqChipsRow}>
                      <Chip
                        label="Weekly"
                        selected={frequency === 'weekly'}
                        onPress={() => setFrequency('weekly')}
                      />
                      <Chip
                        label="Monthly"
                        selected={frequency === 'monthly'}
                        onPress={() => setFrequency('monthly')}
                      />
                    </View>

                    <TextField
                      label="Max Executions (optional)"
                      value={maxRunsStr}
                      onChangeText={setMaxRunsStr}
                      placeholder="e.g. 12"
                      keyboardType="numeric"
                      helperText="Stops automatically after this number of runs"
                    />
                  </>
                )}
              </View>
            )}

            <View style={styles.buttonRow}>
              <Button
                title="Back"
                variant="ghost"
                onPress={() => setStep('amount')}
                style={styles.halfButton}
              />
              <Button
                title="Continue"
                variant="primary"
                onPress={handleWhenContinue}
                style={styles.halfButton}
              />
            </View>
          </View>
        )}

        {/* Step 5: Review */}
        {step === 'review' && selectedBiller && (
          <View style={styles.stepContainer}>
            <Card style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <Text variant="caption" color="textSecondary">
                  TOTAL AMOUNT
                </Text>
                <AmountText
                  amountCentavos={centavos}
                  variant="display"
                  direction="outgoing"
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.reviewRow}>
                <Text variant="body" color="textSecondary">
                  Biller
                </Text>
                <Text variant="bodyStrong">{selectedBiller.name}</Text>
              </View>

              <View style={styles.reviewRow}>
                <Text variant="body" color="textSecondary">
                  {selectedBiller.reference_label}
                </Text>
                <Text variant="bodyStrong">{reference}</Text>
              </View>

              <View style={styles.reviewRow}>
                <Text variant="body" color="textSecondary">
                  From Account
                </Text>
                <Text variant="bodyStrong">
                  {selectedAccount?.account_number || ''}
                </Text>
              </View>

              <View style={styles.reviewRow}>
                <Text variant="body" color="textSecondary">
                  Timing
                </Text>
                <Text variant="bodyStrong">
                  {timing === 'now'
                    ? 'Immediate Payment'
                    : timing === 'later'
                    ? `Once on ${scheduledDate}`
                    : `${frequency === 'weekly' ? 'Weekly' : 'Monthly'} starting ${scheduledDate}`}
                </Text>
              </View>

              <View style={styles.reviewRow}>
                <Text variant="body" color="textSecondary">
                  Bank Fee
                </Text>
                <Text variant="bodyStrong" color="primary">
                  ₱0.00 (Free)
                </Text>
              </View>
            </Card>

            {errorMessage && (
              <View style={styles.errorBox}>
                <AlertCircle size={18} color={colors.redText} />
                <Text variant="caption" color="redText" style={styles.errorText}>
                  {errorMessage}
                </Text>
              </View>
            )}

            <View style={styles.buttonRow}>
              <Button
                title="Back"
                variant="ghost"
                onPress={() => setStep('when')}
                disabled={loading}
                style={styles.halfButton}
              />
              <Button
                title={timing === 'now' ? 'Confirm & Pay' : 'Confirm Schedule'}
                variant="primary"
                onPress={handleSubmitPayment}
                loading={loading}
                style={styles.halfButton}
              />
            </View>
          </View>
        )}

        {/* Step 6: Success */}
        {step === 'success' && selectedBiller && (
          <View style={styles.successContainer}>
            <View style={styles.successIconWrapper}>
              {timing === 'now' ? (
                <CheckCircle2 size={56} color={colors.primary} />
              ) : (
                <Clock size={56} color={colors.primary} />
              )}
            </View>

            <Text variant="h1" style={styles.successTitle}>
              {timing === 'now' ? 'Payment Completed' : `Scheduled for ${scheduledDate}`}
            </Text>

            <Text variant="body" color="textSecondary" style={styles.successSubtitle}>
              {timing === 'now'
                ? `Successfully paid ${selectedBiller.name}`
                : `Your bill payment instruction for ${selectedBiller.name} has been scheduled.`}
            </Text>

            <Card style={styles.receiptCard}>
              <View style={styles.reviewRow}>
                <Text variant="caption" color="textSecondary">
                  Amount
                </Text>
                <Text variant="title" color="ink">
                  {formatCentavosToPHP(centavos)}
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.reviewRow}>
                <Text variant="caption" color="textSecondary">
                  Biller
                </Text>
                <Text variant="bodyStrong">{selectedBiller.name}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text variant="caption" color="textSecondary">
                  Reference
                </Text>
                <Text variant="bodyStrong">{reference}</Text>
              </View>
              {receiptTxId && (
                <View style={styles.reviewRow}>
                  <Text variant="caption" color="textSecondary">
                    Ref ID
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {receiptTxId.slice(0, 8)}...
                  </Text>
                </View>
              )}
            </Card>

            <Button
              title="Done"
              variant="primary"
              onPress={onClose}
              style={styles.fullButton}
            />
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing['2xl'],
  },
  stepContainer: {
    gap: spacing.base,
  },
  categoryChips: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  billerList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  billerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  billerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  billerTextContainer: {
    flex: 1,
  },
  billerHeaderCard: {
    padding: spacing.base,
    backgroundColor: colors.primaryTint,
  },
  billerCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyContainer: {
    padding: spacing['4xl'],
    alignItems: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.base,
  },
  halfButton: {
    flex: 1,
  },
  fullButton: {
    width: '100%',
    marginTop: spacing.base,
  },
  sectionHeader: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  timingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  timingOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  timingTextContainer: {
    marginLeft: spacing.md,
    flex: 1,
  },
  scheduleConfigBox: {
    marginTop: spacing.sm,
    padding: spacing.base,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  configLabel: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  freqChipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reviewCard: {
    padding: spacing.base,
    gap: spacing.md,
  },
  reviewHeader: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.tintRed,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  errorText: {
    flex: 1,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: spacing.base,
  },
  successIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  successTitle: {
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  successSubtitle: {
    textAlign: 'center',
    marginBottom: spacing.base,
    paddingHorizontal: spacing.base,
  },
  receiptCard: {
    width: '100%',
    padding: spacing.base,
    gap: spacing.md,
    marginBottom: spacing.base,
  },
});
