import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Lightbulb, X } from 'lucide-react-native';
import { colors, radius, spacing, size } from '@davao-bank/shared';
import { Text } from './Text';
import { Pressable } from './Pressable';

export interface GuidanceTipProps {
  storageKey: string;
  tipText: string;
}

export function GuidanceTip({ storageKey, tipText }: GuidanceTipProps) {
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    SecureStore.getItemAsync(storageKey)
      .then((seen) => {
        if (mounted && !seen) {
          setVisible(true);
        }
      })
      .catch(() => {
        // Fallback: stay hidden on secure store failure
      });
    return () => {
      mounted = false;
    };
  }, [storageKey]);

  const handleDismiss = async () => {
    setVisible(false);
    try {
      await SecureStore.setItemAsync(storageKey, 'seen');
    } catch {
      // Ignore
    }
  };

  if (!visible) return null;

  return (
    <View style={styles.container} accessibilityRole="note">
      <View style={styles.iconDisc}>
        <Lightbulb size={18} color={colors.primary} />
      </View>
      <Text variant="caption" color={colors.ink} style={styles.text}>
        {tipText}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss tip"
        onPress={handleDismiss}
        style={styles.closeBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <X size={16} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryTint,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  iconDisc: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    lineHeight: 18,
  },
  closeBtn: {
    width: size.touch,
    height: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
