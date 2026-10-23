import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { Inbox } from 'lucide-react-native';
import { colors, radius, spacing } from '@davao-bank/shared';
import { Text } from './Text';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  description?: string; // alias for subtitle
  actionTitle?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export function EmptyState({
  icon,
  title,
  subtitle,
  description,
  actionTitle,
  onAction,
  style,
}: EmptyStateProps) {
  const message = description || subtitle;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconCircle}>
        {icon || <Inbox size={32} color={colors.textMuted} />}
      </View>
      <Text variant="title" color={colors.ink} style={styles.title}>
        {title}
      </Text>
      {message ? (
        <Text
          variant="body"
          color={colors.textSecondary}
          align="center"
          style={styles.subtitle}
        >
          {message}
        </Text>
      ) : null}
      {actionTitle && onAction ? (
        <Button
          title={actionTitle}
          onPress={onAction}
          variant="secondary"
          style={styles.actionBtn}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.xl,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  title: {
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    lineHeight: 22,
    textAlign: 'center',
  },
  actionBtn: {
    marginTop: spacing.lg,
  },
});
