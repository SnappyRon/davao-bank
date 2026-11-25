import React, { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTotpPrompt } from '../context/PasswordPromptContext';
import { retryStepUp } from '../utils/stepUpRetry';
import { lockMyAccountRpc } from './usePhase8Contracts';
import { RiskChallengeSheet } from '../components/RiskChallengeSheet';

export interface TriggerChallengeOptions {
  idempotencyKey: string;
  onRetry: () => Promise<void> | void;
  onCancel?: () => void;
  score?: number | null;
  message?: string;
}

export function useRiskChallenge() {
  const [visible, setVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [currentChallenge, setCurrentChallenge] =
    useState<TriggerChallengeOptions | null>(null);
  const promptTotp = useTotpPrompt();

  const triggerChallenge = useCallback((options: TriggerChallengeOptions) => {
    setCurrentChallenge(options);
    setVisible(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!currentChallenge) return;
    setConfirming(true);
    try {
      const { error: confirmError } = await retryStepUp(
        () =>
          supabase.rpc('confirm_risky_payment', {
            p_idempotency_key: currentChallenge.idempotencyKey,
          }),
        promptTotp
      );

      if (confirmError) {
        throw confirmError;
      }

      setVisible(false);
      const retry = currentChallenge.onRetry;
      setCurrentChallenge(null);
      await retry();
    } finally {
      setConfirming(false);
    }
  }, [currentChallenge, promptTotp]);

  const handleCancel = useCallback(() => {
    const cancelCb = currentChallenge?.onCancel;
    setVisible(false);
    setCurrentChallenge(null);
    cancelCb?.();
  }, [currentChallenge]);

  const handleReportNotMe = useCallback(async () => {
    setVisible(false);
    setCurrentChallenge(null);
    try {
      await lockMyAccountRpc();
    } catch {
      // Ignored
    }
  }, []);

  const challengeSheet = currentChallenge ? (
    <RiskChallengeSheet
      visible={visible}
      score={currentChallenge.score}
      message={currentChallenge.message}
      confirming={confirming}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      onReportNotMe={handleReportNotMe}
    />
  ) : null;

  return {
    triggerChallenge,
    challengeSheet,
    isChallengeActive: visible,
  };
}
