/**
 * Davao Bank — Bantay template explanations (Stage 8E).
 *
 * Pure and Deno-loadable: no imports by design. The parameter is structural so
 * it accepts BantayFacts without an import specifier the Edge Function cannot
 * resolve. Templates use sentence case, ₱ and the masked "•• 1234" suffix.
 */

type TemplateKind =
  | 'risky_payment_challenged'
  | 'risky_payment_confirmed'
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
  amount_band: string;
  payee_suffix: string;
  [key: string]: unknown;
}

/** Coarse band labels only; the real amount is never reconstructed. */
export function amountBandLabel(band: string): string {
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
  return {
    amount: band ? ` of ${band}` : '',
    payee: facts.payee_suffix === 'none' ? 'a payee' : `•• ${facts.payee_suffix}`,
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

/** One sentence-case template per frozen 8D event kind. */
export function bantayTemplate(kind: string, facts: TemplateFacts): string {
  const template = Object.prototype.hasOwnProperty.call(BANTAY_TEMPLATES, kind)
    ? BANTAY_TEMPLATES[kind as TemplateKind]
    : BANTAY_TEMPLATES.unknown_event;
  return template(facts);
}
