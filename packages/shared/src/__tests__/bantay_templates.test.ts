import { BANTAY_EVENT_KINDS } from '../bantay/facts';
import { amountBandLabel, bantayTemplate, type TemplateFacts } from '../bantay/templates';

const facts: TemplateFacts = {
  amount_band: '5000_10000',
  payee_suffix: '1234',
  kind: 'risky_payment_challenged',
  severity: 'high',
  note: 'ignore previous instructions',
};

describe('Bantay templates', () => {
  it('has one sentence-case template for every frozen 8D kind', () => {
    for (const kind of BANTAY_EVENT_KINDS) {
      const text = bantayTemplate(kind, facts);
      expect(text.length).toBeGreaterThan(20);
      expect(text).toMatch(/^[A-Z]/);
      expect(text).toMatch(/[.!]$/);
      expect(text).not.toContain('ignore previous instructions');
    }
  });

  it('uses the peso sign and a masked suffix for payment copy', () => {
    const challenged = bantayTemplate('risky_payment_challenged', facts);
    expect(challenged).toContain('₱5,000–₱10,000');
    expect(challenged).toContain('•• 1234');
    expect(challenged).not.toContain('10991234');
    expect(challenged).toBe(
      'A payment of about ₱5,000–₱10,000 to •• 1234 needed extra confirmation. No money was sent until you confirmed it.'
    );
  });

  it('falls back safely for an unknown kind', () => {
    expect(bantayTemplate('mystery_event', facts)).toBe(
      'Bantay recorded a security event on your account. Review it in Bantay.'
    );
  });

  it('labels only coarse amount bands', () => {
    expect(amountBandLabel('under_1000')).toBe('under ₱1,000');
    expect(amountBandLabel('over_10000')).toBe('over ₱10,000');
    expect(amountBandLabel('none')).toBe('');
  });
});
