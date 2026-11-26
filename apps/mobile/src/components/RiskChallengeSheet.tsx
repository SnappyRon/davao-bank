import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { colors, spacing, radius } from '@davao-bank/shared';
import { MASCOT_BANTAY } from '../assets/illustrations';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { Text } from './Text';

export interface RiskChallengeSheetProps {
  visible: boolean;
  score?: number | null;
  message?: string;
  error?: string | null;
  confirming?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  onReportNotMe?: () => void | Promise<void>;
}

export function RiskChallengeSheet({
  visible,
  score,
  message,
  error,
  confirming = false,
  onConfirm,
  onCancel,
  onReportNotMe,
}: RiskChallengeSheetProps) {
  const displayMessage =
    message || 'This payment has been flagged for review. Confirm it’s you to authorize.';

  return (
    <Sheet
      visible={visible}
      title="Confirmation required"
      titleImage={MASCOT_BANTAY}
      onClose={onCancel}
      footer={
        <View style={styles.actions}>
          <Button
            title="Confirm"
            variant="primary"
            onPress={onConfirm}
            loading={confirming}
            accessibilityLabel="Confirm"
          />
          <Button
            title="Cancel"
            variant="secondary"
            onPress={onCancel}
            disabled={confirming}
            accessibilityLabel="Cancel"
          />
          {onReportNotMe ? (
            <Button
              title="Not me — lock account"
              variant="destructive"
              onPress={onReportNotMe}
              disabled={confirming}
              accessibilityLabel="Not me — lock account"
            />
          ) : null}
        </View>
      }
    >
      <View style={styles.content}>
        <View style={styles.iconDisc}>
          <ShieldAlert size={28} color={colors.orangeText} />
        </View>

        <Text variant="bodyStrong" color={colors.ink}>
          Bantay noticed something unusual
        </Text>

        <Text variant="body" color={colors.ink}>
          {displayMessage}
        </Text>

        {error ? (
          <Text variant="body" color={colors.redText} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {typeof score === 'number' && score > 0 ? (
          <View style={styles.scoreRow}>
            <Text variant="caption" color={colors.textSecondary}>
              Risk score: {score} ({score >= 70 ? 'High' : 'Warning'})
            </Text>
          </View>
        ) : null}

        <Text variant="caption" color={colors.textMuted}>
          No money is sent until you confirm. If you didn’t make this request, lock your
          account.
        </Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.base,
    paddingVertical: spacing.sm,
  },
  iconDisc: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.tintOrange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRow: {
    paddingVertical: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
  },
});
