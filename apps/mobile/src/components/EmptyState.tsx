import React from 'react';
import {
  View,
  ScrollView,
  Image,
  StyleSheet,
  type ImageSourcePropType,
  type ViewStyle,
} from 'react-native';
import { Inbox } from 'lucide-react-native';
import { colors, radius, spacing } from '@davao-bank/shared';
import { Text } from './Text';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  illustration?: ImageSourcePropType | React.ReactNode;
  illustrationTestID?: string;
  title: string;
  subtitle?: string;
  description?: string; // alias for subtitle
  descriptionAccessibilityRole?: 'alert' | 'text';
  actionTitle?: string;
  onAction?: () => void;
  style?: ViewStyle;
  refreshControl?: React.ReactElement;
  scrollable?: boolean;
}

export function EmptyState({
  icon,
  illustration,
  illustrationTestID,
  title,
  subtitle,
  description,
  descriptionAccessibilityRole,
  actionTitle,
  onAction,
  style,
  refreshControl,
  scrollable = true,
}: EmptyStateProps) {
  const message = description || subtitle;

  const content = (
    <View style={[styles.inner, !scrollable && style]}>
      {illustration ? (
        <View style={styles.illustrationBox} testID={illustrationTestID}>
          {React.isValidElement(illustration) ? (
            illustration
          ) : (
            <Image
              source={illustration as ImageSourcePropType}
              style={styles.illustration}
              resizeMode="contain"
              accessible={false}
            />
          )}
        </View>
      ) : (
        <View style={styles.iconCircle}>
          {icon || <Inbox size={32} color={colors.textMuted} />}
        </View>
      )}
      <Text variant="title" color={colors.ink} style={styles.title}>
        {title}
      </Text>
      {message ? (
        <Text
          variant="body"
          color={colors.textSecondary}
          align="center"
          accessibilityRole={descriptionAccessibilityRole}
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

  if (scrollable) {
    return (
      <ScrollView
        contentContainerStyle={[styles.container, style]}
        refreshControl={refreshControl}
        alwaysBounceVertical
      >
        {content}
      </ScrollView>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.xl,
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  illustrationBox: {
    width: 120,
    height: 120,
    marginBottom: spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustration: {
    width: 120,
    height: 120,
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
