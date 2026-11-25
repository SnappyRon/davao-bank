import React, { useCallback } from 'react';
import { MASCOT_BANTAY } from '../assets/illustrations';
import { useBantayRealtime, type BantayAlertEvent } from '../hooks/useBantayRealtime';
import { bantayEventTitle } from '../utils/bantayTemplates';
import { useToast } from './Toast';

export interface BantayRealtimeBridgeProps {
  userId: string | null;
  onAlert: () => void;
  onOpenBantay: () => void;
}

/**
 * Turns a high-severity Realtime event into an actionable toast and an Inbox
 * badge refresh. The title is live text; the image is decorative and supplied
 * by the toast itself.
 */
export function BantayRealtimeBridge({
  userId,
  onAlert,
  onOpenBantay,
}: BantayRealtimeBridgeProps) {
  const { show } = useToast();

  const handleHighAlert = useCallback(
    (event: BantayAlertEvent) => {
      show(
        `Bantay: ${bantayEventTitle(event.kind ?? '')}`,
        'error',
        {
          label: 'Open Bantay',
          onPress: onOpenBantay,
        },
        MASCOT_BANTAY
      );
      onAlert();
    },
    [show, onAlert, onOpenBantay]
  );

  useBantayRealtime(userId, handleHighAlert);
  return null;
}
