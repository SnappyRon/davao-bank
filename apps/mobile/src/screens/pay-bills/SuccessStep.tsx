import React, { useState } from 'react';
import { View, StyleSheet, Switch } from 'react-native';
import { BookmarkCheck } from 'lucide-react-native';
import { colors, radius, size, spacing, type Biller } from '@davao-bank/shared';
import type { PaymentTiming } from '../../components/WhenPicker';
import { ResultView } from '../../components/ResultView';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { TextField } from '../../components/TextField';
import { Pressable } from '../../components/Pressable';
import { useToast } from '../../components/Toast';
import { resultRows, type ResultResponse } from '../../utils/resultReceipt';
import { phase8UserMessage, saveBillerRecord } from '../../hooks/usePhase8Contracts';
import { parseDueDayInput } from './BillerStep';

interface SuccessStepProps {
  biller: Biller;
  reference: string;
  centavos: number;
  timing: PaymentTiming;
  scheduledDate: string;
  receiptTxId: string | null;
  serverResult?: ResultResponse | null;
  hideBalance: boolean;
  onDone: () => void;
  onPayAgain: () => void;
  isAlreadySaved?: boolean;
  onSavedBiller?: () => void;
}

export function SuccessStep({
  biller,
  reference,
  timing,
  serverResult,
  hideBalance,
  onDone,
  onPayAgain,
  isAlreadySaved = false,
  onSavedBiller,
}: SuccessStepProps) {
  const toast = useToast();
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [nickname, setNickname] = useState(() => biller.name.slice(0, 40));
  const [dueDayStr, setDueDayStr] = useState('');
  const [remind, setRemind] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedDone, setSavedDone] = useState(false);

  const date = serverResult?.next_run_date || serverResult?.start_date;
  const title =
    timing === 'now'
      ? 'Bill paid'
      : date
        ? `Bill payment scheduled for ${new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : 'Bill payment scheduled';

  const handleSaveBiller = async () => {
    const nick = nickname.trim();
    if (!nick || nick.length > 40) {
      setSaveError('Nickname must be 1 to 40 characters.');
      return;
    }
    const due = parseDueDayInput(dueDayStr);
    if (!due.valid) {
      setSaveError('Due day must be between 1 and 28.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await saveBillerRecord({
        biller_id: biller.id,
        reference: reference.trim(),
        nickname: nick,
        due_day: due.value,
        remind,
      });
      if (error) {
        setSaveError(phase8UserMessage(error));
        return;
      }
      setSavedDone(true);
      setShowSaveForm(false);
      toast.show('Biller saved');
      onSavedBiller?.();
    } catch (err) {
      setSaveError(phase8UserMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const canSaveAfterPaying =
    timing === 'now' && !isAlreadySaved && Boolean(onSavedBiller);

  return (
    <View style={styles.wrapper}>
      <ResultView
        outcome={timing === 'now' ? 'completed' : 'scheduled'}
        title={title}
        amountCentavos={serverResult?.amount}
        details={serverResult ? resultRows(serverResult) : []}
        hideBalance={hideBalance}
        shareReceipt={!!serverResult}
        contextualActionTitle="Pay another bill"
        onContextualAction={onPayAgain}
        onDone={onDone}
      />

      {canSaveAfterPaying ? (
        <View style={styles.saveContainer}>
          {savedDone ? (
            <Card variant="subtle" style={styles.savedCard}>
              <BookmarkCheck size={20} color={colors.primary} />
              <Text variant="bodyStrong" color={colors.primary}>
                Saved to your billers
              </Text>
            </Card>
          ) : showSaveForm ? (
            <Card variant="default" style={styles.formCard}>
              <Text variant="title" color={colors.ink}>
                Save this biller
              </Text>
              <TextField
                label="Nickname"
                value={nickname}
                onChangeText={(val) => {
                  setNickname(val);
                  if (saveError) setSaveError(null);
                }}
                maxLength={40}
                placeholder="e.g. Home internet"
              />
              <TextField
                label="Due day (1–28, optional)"
                value={dueDayStr}
                onChangeText={(val) => {
                  setDueDayStr(val);
                  if (saveError) setSaveError(null);
                }}
                placeholder="e.g. 15"
                keyboardType="number-pad"
                maxLength={2}
              />
              <Pressable
                onPress={() => setRemind((prev) => !prev)}
                feedbackType="highlight"
                accessibilityRole="switch"
                accessibilityLabel="Remind 7 days before due date"
                accessibilityState={{ checked: remind }}
                style={styles.remindRow}
              >
                <Text variant="body" color={colors.ink} style={styles.remindText}>
                  Remind 7 days before due date
                </Text>
                <View
                  pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Switch
                    value={remind}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={colors.surface}
                  />
                </View>
              </Pressable>
              {saveError ? (
                <Text variant="caption" color={colors.redText} accessibilityRole="alert">
                  {saveError}
                </Text>
              ) : null}
              <View style={styles.formButtons}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setShowSaveForm(false)}
                  disabled={saving}
                  style={styles.halfBtn}
                />
                <Button
                  title={saving ? 'Saving…' : 'Save biller'}
                  onPress={() => void handleSaveBiller()}
                  loading={saving}
                  style={styles.halfBtn}
                />
              </View>
            </Card>
          ) : (
            <Button
              title="Save this biller"
              variant="secondary"
              onPress={() => setShowSaveForm(true)}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  saveContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.md,
  },
  formCard: {
    padding: spacing.base,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  remindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: size.touch,
    gap: spacing.sm,
  },
  remindText: {
    flex: 1,
  },
  formButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  halfBtn: {
    flex: 1,
  },
});
