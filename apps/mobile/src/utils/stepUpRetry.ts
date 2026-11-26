export type ConfirmationResult = {
  success: boolean;
  cancelled?: boolean;
  error?: string;
};

/** Capture the request in send; never regenerate an idempotency key for this retry. */
export async function retryStepUp<T extends { error: unknown }>(
  send: () => PromiseLike<T>,
  confirm: () => Promise<ConfirmationResult>
): Promise<T> {
  const result = await send();
  const error = result.error;
  const message =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : '';
  if (!/STEP_UP_REQUIRED|STEP_UP_EXPIRED/.test(message)) return result;
  const confirmation = await confirm();
  if (confirmation.success) return await send();
  const failure = confirmation.cancelled
    ? 'Authorization was cancelled. You can retry whenever ready.'
    : confirmation.error || 'Authentication required';
  return {
    ...result,
    error:
      typeof error === 'string' ? failure : { ...(error as object), message: failure },
  };
}
