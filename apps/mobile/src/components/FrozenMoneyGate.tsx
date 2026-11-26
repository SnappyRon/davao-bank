import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { colors, spacing } from '@davao-bank/shared';
import { Button, Card, Text } from './';
import type { ProtectiveFreezeState } from '../hooks/useProtectiveFreeze';
import {
  PROTECTIVE_FREEZE_BODY,
  PROTECTIVE_FREEZE_CONFIRM_LABEL,
  PROTECTIVE_FREEZE_TITLE,
} from '../utils/protectiveFreeze';

export interface FrozenMoneyGateProps {
  freeze: ProtectiveFreezeState;
  onConfirm: () => void;
}

/**
 * A money screen's frozen state. It replaces the flow before any account read
 * or money RPC, and points to the existing unlock flow in Bantay.
 */
export function FrozenMoneyGate({ freeze, onConfirm }: FrozenMoneyGateProps) {
  if (!freeze.protective) return null;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={PROTECTIVE_FREEZE_TITLE}
      testID="frozen-money-gate"
    >
      <Card style={styles.card}>
        <View style={styles.iconRow}>
          <ShieldAlert size={22} color={colors.redText} strokeWidth={2} />
          <Text variant="bodyStrong" color={colors.redText}>
            {PROTECTIVE_FREEZE_TITLE}
          </Text>
        </View>
        <Text variant="body" color={colors.ink}>
          {PROTECTIVE_FREEZE_BODY}
        </Text>
        <Button
          title={PROTECTIVE_FREEZE_CONFIRM_LABEL}
          onPress={onConfirm}
          accessibilityLabel={PROTECTIVE_FREEZE_CONFIRM_LABEL}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.lg },
  card: { gap: spacing.md },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
