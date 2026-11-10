import React, { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { toUserMessage } from '@davao-bank/shared';
import { ConfirmSheet, type ConfirmSheetProps } from '../components/ConfirmSheet';

type Confirmation = Omit<ConfirmSheetProps, 'visible' | 'onCancel'> & {
  onCancel?: () => void;
};

/**
 * Shows a ConfirmSheet. The sheet stays mounted while it slides out, and the
 * confirmed action runs once it is hidden, after it has released its
 * password/code host, so step-up prompts open in the screen's own host.
 */
export function useConfirmSheet() {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [visible, setVisible] = useState(false);
  const pending = useRef<Confirmation | null>(null);
  const confirmedAction = useRef<Confirmation['onConfirm'] | null>(null);

  useEffect(() => {
    if (visible) return;
    const action = confirmedAction.current;
    confirmedAction.current = null;
    if (!action) return;
    new Promise<void>((resolve) => resolve(action())).catch((err) =>
      Alert.alert('Error', toUserMessage(err))
    );
  }, [visible]);

  const showConfirmation = (next: Confirmation) => {
    if (pending.current) return;
    pending.current = next;
    setConfirmation(next);
    setVisible(true);
  };
  const onConfirm = () => {
    if (!pending.current) return;
    confirmedAction.current = pending.current.onConfirm;
    pending.current = null;
    setVisible(false);
  };
  const onCancel = () => {
    if (!pending.current) return;
    const action = pending.current.onCancel;
    pending.current = null;
    setVisible(false);
    action?.();
  };

  const confirmSheet = confirmation ? (
    <ConfirmSheet
      {...confirmation}
      visible={visible}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  ) : null;

  return { showConfirmation, confirmSheet };
}
