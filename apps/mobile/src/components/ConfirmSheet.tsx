import React from 'react';
import { View, StyleSheet, type ImageSourcePropType } from 'react-native';
import { spacing } from '@davao-bank/shared';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { Text } from './Text';

export interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  /** Decorative Bantay art for security confirmations; title stays live text. */
  image?: ImageSourcePropType;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmSheet({
  visible,
  title,
  message,
  image,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  return (
    <Sheet
      visible={visible}
      title={title}
      titleImage={image}
      onClose={onCancel}
      footer={
        <View style={styles.actions}>
          <Button
            title={confirmLabel}
            variant={destructive ? 'destructive' : 'primary'}
            onPress={onConfirm}
          />
          <Button title={cancelLabel} variant="secondary" onPress={onCancel} />
        </View>
      }
    >
      {message ? <Text>{message}</Text> : null}
    </Sheet>
  );
}
const styles = StyleSheet.create({ actions: { gap: spacing.md } });
