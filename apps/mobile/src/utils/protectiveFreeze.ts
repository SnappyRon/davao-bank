import type { SecurityEvent } from '../hooks/usePhase8Contracts';

/** Server contract: the existing Bantay lock writes this event kind. */
export const PROTECTIVE_LOCK_EVENT_KIND = 'protective_lock';

/** Server contract: the one notification written for a protective freeze. */
export const BANTAY_PROTECTIVE_LOCK_NOTIFICATION_TYPE = 'bantay_protective_lock';

export const PROTECTIVE_FREEZE_TITLE = 'Bantay froze your account';
export const PROTECTIVE_FREEZE_HOME_TITLE = 'Account frozen by Bantay';
export const PROTECTIVE_FREEZE_CONFIRM_LABEL = "Confirm it's me";
export const PROTECTIVE_FREEZE_BODY =
  "We froze your account to protect your money. No money can leave until you confirm it's you. Davao Bank will never ask you to move your money.";
// The brief's opener plus the spec's mandatory anti-scam sentence.
export const PROTECTIVE_FREEZE_KADA_BODY =
  'I froze your account to keep your money safe. Tap to see what happened. Davao Bank will never ask you to move your money.';
// The spec's shorter, title-led form; shown as the bubble's second line so both
// approved scripts stay present without replacing either one.
export const PROTECTIVE_FREEZE_KADA_SPEC_BODY =
  'Bantay froze your account to protect your money. Check Bantay.';
export const PROTECTIVE_FREEZE_TILE_LABEL = 'Bantay froze your account — check Bantay';

export function isProtectiveLockEvent(event: SecurityEvent): boolean {
  return event.kind === PROTECTIVE_LOCK_EVENT_KIND;
}

/**
 * A protective freeze is the existing 8D lock plus a real `protective_lock`
 * event. The event stays in history after unlock, so `locked` is required too.
 */
export function isProtectiveFreeze(locked: boolean, events: SecurityEvent[]): boolean {
  return locked && events.some(isProtectiveLockEvent);
}
