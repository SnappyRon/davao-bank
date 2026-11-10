import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing } from '@davao-bank/shared';
import { Text } from './Text';
import { Button } from './Button';

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
  if (loading) return <Text accessibilityRole="progressbar">Loading accounts…</Text>;
  if (!error && !empty) return null;
  return (
    <View style={styles.container}>
      <Text accessibilityRole="alert" color={colors.redText}>
        {error || 'No accounts available.'}
      </Text>
      <Button title="Try again" variant="secondary" onPress={onRetry} />
    </View>
  );
}
const styles = StyleSheet.create({ container: { gap: spacing.md } });
