import React from 'react';
import { TouchableOpacity, View, StyleSheet, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { colors, radius, spacing } from '@davao-bank/shared';
import { Text } from './Text';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function ListRow({
  title,
  subtitle,
  leftElement,
  rightElement,
  showChevron = false,
  onPress,
  style,
}: ListRowProps) {
  const content = (
    <View style={[styles.row, style]}>
      {leftElement ? <View style={styles.left}>{leftElement}</View> : null}
      <View style={styles.content}>
        <Text variant="bodyStrong" color={colors.ink}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color={colors.textSecondary} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightElement ? <View style={styles.right}>{rightElement}</View> : null}
      {showChevron ? (
        <ChevronRight size={20} color={colors.textMuted} style={styles.chevron} />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSubtle,
  },
  left: {
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
  },
  subtitle: {
    marginTop: 2,
  },
  right: {
    marginLeft: spacing.sm,
  },
  chevron: {
    marginLeft: spacing.xs,
  },
});
