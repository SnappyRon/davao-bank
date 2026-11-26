import { formatCentavosToPHP } from '@davao-bank/shared';

/**
 * Shared copy for the money flow sequence (spec 7B.4):
 * Input → Review → Authorize → Processing → Result.
 */

export type MoneyAction = 'send' | 'add' | 'cashOut' | 'pay' | 'schedule';

const ACTION_COPY: Record<MoneyAction, { verb: string; busy: string }> = {
  send: { verb: 'Send', busy: 'Sending…' },
  add: { verb: 'Add', busy: 'Adding…' },
  cashOut: { verb: 'Cash out', busy: 'Cashing out…' },
  pay: { verb: 'Pay', busy: 'Paying…' },
  schedule: { verb: 'Schedule', busy: 'Scheduling…' },
};

/** The commit button names the money: "Send ₱500.00"; busy: "Sending…". */
export function commitButtonLabel(
  action: MoneyAction,
  centavos: number,
  busy: boolean
): string {
  const copy = ACTION_COPY[action];
  return busy ? copy.busy : `${copy.verb} ${formatCentavosToPHP(centavos)}`;
}

/** The review footnote shown under every Review card. */
export const REVIEW_FOOTNOTE = 'Simulated money — no real funds move.';

/** "2026-11-10" → "Nov 10, 2026". Anything unparseable is returned as typed. */
export function formatPlainDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** The Review "When" row: "Now", "Once on Nov 10, 2026", "Monthly from Nov 10, 2026 · 12 times". */
export function formatWhen(
  timing: 'now' | 'later' | 'recurring',
  scheduledDate: string,
  frequency: string,
  maxRunsStr?: string
): string {
  if (timing === 'now') return 'Now';
  const date = formatPlainDate(scheduledDate);
  if (timing === 'later') return `Once on ${date}`;
  const freq = frequency === 'weekly' ? 'Weekly' : 'Monthly';
  const runs = maxRunsStr && maxRunsStr.trim() ? ` · ${maxRunsStr.trim()} times` : '';
  return `${freq} from ${date}${runs}`;
}

/**
 * A helper example for a biller reference, never the regex itself
 * (spec 7B.4 and item 10): "e.g. 10 digits, on your bill".
 */
export function describeReferenceFormat(pattern: string | null | undefined): string {
  const p = (pattern ?? '').trim();
  const digitsOnly = /^\^(?:\[0-9\]|\\d)\{(\d+)\}\$$/.exec(p);
  if (digitsOnly) return `e.g. ${digitsOnly[1]} digits, on your bill`;
  const prefixed = /^\^(\d+)(?:\[0-9\]|\\d)\{(\d+)\}\$$/.exec(p);
  if (prefixed) {
    const total = prefixed[1].length + Number(prefixed[2]);
    return `e.g. ${total} digits starting with ${prefixed[1]}, on your bill`;
  }
  return 'e.g. the number on your bill';
}
