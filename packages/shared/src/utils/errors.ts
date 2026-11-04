import { formatCentavosToPHP } from '../types';

declare const __DEV__: boolean | undefined;

/**
 * Maps raw backend or Supabase errors to friendly, safe, user-facing copy.
 * Never exposes raw SQL errors, stack traces, or internal database constraints.
 */
export function toUserMessage(
  error: unknown,
  availableBalance?: string | number
): string {
  const rawMsg =
    typeof error === 'string'
      ? error
      : (error as any)?.message ||
        (error as any)?.error_description ||
        (error as any)?.details ||
        String(error || '');

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[toUserMessage] Original error:', error);
  }

  const lower = rawMsg.toLowerCase();

  if (lower.includes('insufficient funds')) {
    if (typeof availableBalance === 'number') {
      return `Not enough balance. You have ${formatCentavosToPHP(availableBalance)} available.`;
    }
    if (typeof availableBalance === 'string' && availableBalance) {
      return `Not enough balance. You have ${availableBalance} available.`;
    }
    return 'Not enough balance. Please check your available funds.';
  }

  if (
    lower.includes('recipient account number not found') ||
    lower.includes('account number not found')
  ) {
    return "We couldn't find that account. Check the 10 digits.";
  }

  if (lower.includes('not active') || lower.includes('inactive')) {
    return "This account can't send or receive money right now.";
  }

  if (lower.includes('invalid reference format') || lower.includes('invalid reference')) {
    return "That reference doesn't look right. Check your bill and try again.";
  }

  if (lower.includes('no longer pending')) {
    return 'This request was already paid, declined or cancelled.';
  }

  if (lower.includes('invalid login credentials')) {
    return "That email and password don't match. Try again.";
  }

  if (lower.includes('email not confirmed')) {
    return 'Please verify your email address before signing in.';
  }

  if (lower.includes('user already registered') || lower.includes('already registered')) {
    return 'An account with this email already exists.';
  }

  if (
    lower.includes('password should be at least') ||
    lower.includes('password is too short')
  ) {
    return 'Password is too weak. Please use at least 10 characters.';
  }

  if (
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('over_email_send_rate_limit')
  ) {
    return 'Too many attempts. Please try again in a few minutes.';
  }

  if (
    lower.includes('token has expired') ||
    lower.includes('token is invalid') ||
    lower.includes('otp expired')
  ) {
    return 'This verification code or link has expired. Please request a new one.';
  }

  if (
    lower.includes('not an administrator') ||
    lower.includes('unauthorized') ||
    lower.includes('permission denied') ||
    lower.includes('admin_only')
  ) {
    return 'You do not have permission to perform this action.';
  }

  if (lower.includes('failed to fetch') || lower.includes('network request failed')) {
    return 'You appear to be offline. Nothing was sent.';
  }

  return 'Something went wrong. No money was sent. Try again.';
}
