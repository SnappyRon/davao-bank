/**
 * Davao Bank — Bantay template explanations and titles (Stage 8F).
 * Follows the frozen 8D contract and design spec.
 */

export type TemplateKind =
  | 'risky_payment_challenged'
  | 'risky_payment_confirmed'
  | 'risky_payment_warning'
  | 'new_device'
  | 'signin_failures'
  | 'code_failures'
  | 'mfa_changed'
  | 'password_changed'
  | 'limit_changed'
  | 'account_locked'
  | 'account_unlocked'
  | 'unknown_event';

export interface TemplateFacts {
  amount_band?: string;
  payee_suffix?: string;
  to_account_number?: string;
  amount_centavos?: number;
  [key: string]: unknown;
}

export function amountBandLabel(band?: string): string {
  switch (band) {
    case 'under_1000':
      return 'under ₱1,000';
    case '1000_5000':
      return 'about ₱1,000–₱5,000';
    case '5000_10000':
      return 'about ₱5,000–₱10,000';
    case 'over_10000':
      return 'over ₱10,000';
    default:
      return '';
  }
}

function paymentPhrases(facts: TemplateFacts): { amount: string; payee: string } {
  const band = amountBandLabel(facts.amount_band);
  let payee = 'a payee';
  if (facts.payee_suffix && facts.payee_suffix !== 'none') {
    payee = `•• ${facts.payee_suffix}`;
  } else if (facts.to_account_number) {
    payee = `•• ${facts.to_account_number.slice(-4)}`;
  }
  return {
    amount: band ? ` of ${band}` : '',
    payee,
  };
}

export const BANTAY_TEMPLATES: Record<TemplateKind, (facts: TemplateFacts) => string> = {
  risky_payment_challenged: (facts) => {
    const { amount, payee } = paymentPhrases(facts);
    return `A payment${amount} to ${payee} needed extra confirmation. No money was sent until you confirmed it.`;
  },
  risky_payment_confirmed: (facts) => {
    const { amount, payee } = paymentPhrases(facts);
    return `You confirmed a payment${amount} to ${payee} after an extra check. No further action is needed.`;
  },
  risky_payment_warning: () => 'A payment looked unusual and Bantay showed a warning.',
  new_device: () =>
    'A new device signed in to your account. If this wasn’t you, lock your account in Bantay.',
  signin_failures: () =>
    'Several sign-in attempts failed. If these weren’t yours, change your password in Profile.',
  code_failures: () =>
    'Several verification codes were entered incorrectly. If this wasn’t you, review your security settings.',
  mfa_changed: () =>
    'Your two-step verification settings changed. If this wasn’t you, lock your account in Bantay.',
  password_changed: () =>
    'Your password changed. If this wasn’t you, lock your account in Bantay.',
  limit_changed: () =>
    'Your daily transfer limit changed. If this wasn’t you, review your limits in Bantay.',
  account_locked: () =>
    'Your account is locked for outgoing money. You can still sign in and unlock it in Bantay.',
  account_unlocked: () => 'Your account is unlocked. Outgoing money is available again.',
  unknown_event: () =>
    'Bantay recorded a security event on your account. Review it in Bantay.',
};

export function bantayTemplate(kind: string, facts?: TemplateFacts | null): string {
  const safeFacts = facts || {};
  const template = Object.prototype.hasOwnProperty.call(BANTAY_TEMPLATES, kind)
    ? BANTAY_TEMPLATES[kind as TemplateKind]
    : BANTAY_TEMPLATES.unknown_event;
  return template(safeFacts);
}

export function bantayEventTitle(kind: string): string {
  switch (kind) {
    case 'risky_payment_challenged':
      return 'Payment review required';
    case 'risky_payment_confirmed':
      return 'Payment confirmed';
    case 'risky_payment_warning':
      return 'Payment warning';
    case 'new_device':
      return 'New device sign-in';
    case 'signin_failures':
      return 'Failed sign-in attempts';
    case 'code_failures':
      return 'Verification code failures';
    case 'mfa_changed':
      return 'Two-step verification updated';
    case 'password_changed':
      return 'Password changed';
    case 'limit_changed':
      return 'Daily limit updated';
    case 'account_locked':
      return 'Account locked';
    case 'account_unlocked':
      return 'Account unlocked';
    default:
      return 'Security event';
  }
}
