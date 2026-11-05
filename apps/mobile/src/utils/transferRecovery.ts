import type { MoneyOperationResult } from '@davao-bank/shared';

type TransferReply = { data: MoneyOperationResult | null; error: string | null };

export function isUncertainTransferError(error: string | null): boolean {
  return /network request failed|failed to fetch|timeout|timed out/i.test(error || '');
}

/** Retry the same captured request, never generate a new idempotency key. */
export async function recoverTransfer(
  send: () => Promise<TransferReply>,
  onChecking: () => void,
  wait: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 1000))
): Promise<TransferReply> {
  for (let attempt = 0; ; attempt++) {
    let reply: TransferReply;
    try {
      reply = await send();
    } catch (error) {
      reply = {
        data: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (!isUncertainTransferError(reply.error) || attempt === 2) return reply;
    onChecking();
    await wait();
  }
}
