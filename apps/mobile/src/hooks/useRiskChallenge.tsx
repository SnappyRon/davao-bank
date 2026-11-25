import React, { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTotpPrompt } from '../context/PasswordPromptContext';
import { retryStepUp } from '../utils/stepUpRetry';
import {
  isChallengeExpired,
  lockMyAccountRpc,
  phase8UserMessage,
  prepareRiskChallengeRpc,
} from './usePhase8Contracts';
import { RiskChallengeSheet } from '../components/RiskChallengeSheet';

export interface TriggerChallengeOptions {
  idempotencyKey: string;
  /** Centavos — the amount the server risk guard scored. */
  amount?: number;
  toAccountId?: string | null;
  toAccountNumber?: string | null;
  onRetry: () => Promise<void> | void;
  onCancel?: () => void;
  score?: number | null;
  message?: string;
}

export function useRiskChallenge() {
  const [visible, setVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [currentChallenge, setCurrentChallenge] =
    useState<TriggerChallengeOptions | null>(null);
  const promptTotp = useTotpPrompt();

  const triggerChallenge = useCallback((options: TriggerChallengeOptions) => {
    setSheetError(null);
    setCurrentChallenge(options);
    setVisible(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!currentChallenge) return;
    const key = currentChallenge.idempotencyKey;
    setConfirming(true);
    setSheetError(null);
    try {
      // The money RPC's 'Confirmation required' RAISE rolls back the challenge
      // insert/renewal, and confirm_risky_payment's 'Challenge expired' RAISE
      // rolls back its own renewal. Prepare in a separate committed RPC first.
      const prepare = async () => {
        const { error } = await prepareRiskChallengeRpc({
          idempotencyKey: key,
          amount: currentChallenge.amount ?? 0,
          toAccountId: currentChallenge.toAccountId,
          toAccountNumber: currentChallenge.toAccountNumber,
        });
        if (error) throw error;
      };
      const confirm = () =>
        retryStepUp(
          () => supabase.rpc('confirm_risky_payment', { p_idempotency_key: key }),
          promptTotp
        );

      await prepare();
      let confirmResult = await confirm();
      if (isChallengeExpired(confirmResult.error)) {
        await prepare();
        confirmResult = await confirm();
      }
      if (confirmResult.error) throw confirmResult.error;

      setVisible(false);
      const retry = currentChallenge.onRetry;
      setCurrentChallenge(null);
      await retry();
    } catch (err) {
      setSheetError(phase8UserMessage(err));
    } finally {
      setConfirming(false);
    }
  }, [currentChallenge, promptTotp]);

  const handleCancel = useCallback(() => {
    const cancelCb = currentChallenge?.onCancel;
    setVisible(false);
    setCurrentChallenge(null);
    setSheetError(null);
    cancelCb?.();
  }, [currentChallenge]);

  const handleReportNotMe = useCallback(async () => {
    setVisible(false);
    setCurrentChallenge(null);
    setSheetError(null);
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
      error={sheetError}
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
