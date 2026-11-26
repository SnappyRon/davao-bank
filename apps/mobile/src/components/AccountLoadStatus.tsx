import React from 'react';
import { View, StyleSheet } from 'react-native';
import { spacing } from '@davao-bank/shared';
import { MASCOT_EMPTY, MASCOT_ERROR } from '../assets/illustrations';
import { EmptyState } from './EmptyState';
import { GroupedList, ListHairline, LIST_ROW_MIN_HEIGHT } from './GroupedList';
import { Skeleton } from './Skeleton';

const ACCOUNT_SKELETON_ROWS = 2;

export function AccountLoadStatus({
  loading,
  error,
  onRetry,
  empty,
}: {
  loading: boolean;
  empty: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Loading accounts…"
        testID="accounts-skeleton"
      >
        <GroupedList>
          {Array.from({ length: ACCOUNT_SKELETON_ROWS }, (_, index) => (
            <View key={index}>
              <Skeleton width="100%" height={LIST_ROW_MIN_HEIGHT} style={styles.row} />
              {index < ACCOUNT_SKELETON_ROWS - 1 ? <ListHairline /> : null}
            </View>
          ))}
        </GroupedList>
      </View>
    );
  }
  if (!error) {
    return empty ? (
      <EmptyState
        title="No accounts yet"
        description="You have no accounts yet."
        illustration={MASCOT_EMPTY}
        illustrationTestID="accounts-empty-mascot"
        scrollable={false}
      />
    ) : null;
  }
  return (
    <EmptyState
      title="Accounts unavailable"
      description={error}
      descriptionAccessibilityRole="alert"
      illustration={MASCOT_ERROR}
      illustrationTestID="accounts-error-mascot"
      actionTitle="Try again"
      onAction={onRetry}
      scrollable={false}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: 0,
    marginVertical: spacing.xs,
  },
});
