import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import {
  colors,
  formatReferenceId,
  radius,
  spacing,
  toUserMessage,
} from '@davao-bank/shared';
import { REVIEW_FOOTNOTE } from '../utils/moneyFlow';
import { Badge } from './Badge';
import { Text } from './Text';
import { ResultView, type ResultDetailRow, type ResultOutcome } from './ResultView';

export const SERVICE_SIMULATION_MESSAGE =
  'Simulation — play money only; no real bank product is provided.';

export interface ServiceSimulationBannerProps {
  message?: string;
  style?: ViewStyle;
  testID?: string;
}

/**
 * Shared simulation disclosure shown in More services and on every Phase 9
 * simulated service screen (Spec §3).
 */
export function ServiceSimulationBanner({
  message = SERVICE_SIMULATION_MESSAGE,
  style,
  testID = 'service-simulation-banner',
}: ServiceSimulationBannerProps) {
  return (
    <View style={[styles.banner, style]} testID={testID}>
      <Badge label="Simulation" variant="warning" />
      <Text
        variant="caption"
        color={colors.textSecondary}
        style={styles.bannerText}
        maxFontSizeMultiplier={1.4}
      >
        {message}
      </Text>
    </View>
  );
}

export interface ServiceResultProps {
  outcome?: ResultOutcome;
  title: string;
  subtitle?: string;
  referenceId?: string | null;
  details?: ResultDetailRow[];
  simulationMessage?: string;
  footnote?: string;
  error?: unknown;
  onRetry?: () => void;
  onDone: () => void;
  contextualActionTitle?: string;
  onContextualAction?: () => void;
}

/**
 * Shared result wrapper for simulated Phase 9 services (Spec §3):
 * formats reference IDs via `formatReferenceId`, maps errors via `toUserMessage`,
 * attaches the Simulation banner and renders `REVIEW_FOOTNOTE`.
 */
export function ServiceResult({
  outcome = 'completed',
  title,
  subtitle,
  referenceId,
  details = [],
  simulationMessage,
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
      <ServiceSimulationBanner message={simulationMessage} />
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  bannerText: {
    flex: 1,
  },
  resultWrapper: {
    gap: spacing.base,
  },
});
