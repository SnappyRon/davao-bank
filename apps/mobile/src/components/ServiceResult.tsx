import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, formatReferenceId, spacing, toUserMessage } from '@davao-bank/shared';
import { REVIEW_FOOTNOTE } from '../utils/moneyFlow';
import { Text } from './Text';
import { ResultView, type ResultDetailRow, type ResultOutcome } from './ResultView';

export interface ServiceResultProps {
  outcome?: ResultOutcome;
  title: string;
  subtitle?: string;
  referenceId?: string | null;
  details?: ResultDetailRow[];
  footnote?: string;
  error?: unknown;
  onRetry?: () => void;
  onDone: () => void;
  contextualActionTitle?: string;
  onContextualAction?: () => void;
}

/**
 * Shared result wrapper for Phase 9 services: formats reference IDs via
 * `formatReferenceId`, maps errors via `toUserMessage` and renders
 * `REVIEW_FOOTNOTE`.
 */
export function ServiceResult({
  outcome = 'completed',
  title,
  subtitle,
  referenceId,
  details = [],
  footnote = REVIEW_FOOTNOTE,
  error,
  onRetry,
  onDone,
  contextualActionTitle,
  onContextualAction,
}: ServiceResultProps) {
  const formattedReference = referenceId ? formatReferenceId(referenceId) : null;
  const resolvedDetails: ResultDetailRow[] = formattedReference
    ? [{ label: 'Reference', value: formattedReference }, ...details]
    : details;
  const resolvedSubtitle =
    error !== undefined && error !== null ? toUserMessage(error, 'account') : subtitle;
  const actionTitle =
    contextualActionTitle ?? (outcome === 'failed' && onRetry ? 'Try again' : undefined);
  const actionHandler =
    onContextualAction ?? (outcome === 'failed' && onRetry ? onRetry : undefined);

  return (
    <View style={styles.resultWrapper}>
      <ResultView
        outcome={outcome}
        title={title}
        subtitle={resolvedSubtitle}
        details={resolvedDetails}
        onDone={onDone}
        contextualActionTitle={actionTitle}
        onContextualAction={actionHandler}
      />
      <Text
        variant="caption"
        color={colors.textMuted}
        align="center"
        maxFontSizeMultiplier={1.4}
      >
        {footnote}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  resultWrapper: {
    gap: spacing.base,
  },
});
