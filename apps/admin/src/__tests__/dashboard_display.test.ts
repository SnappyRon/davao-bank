import { auditLabel, ledgerReference } from '../lib/dashboardDisplay';

it('makes audit actions readable, including events without a specific label', () => {
  expect(auditLabel('deposit_completed')).toBe('Money added');
  expect(auditLabel('funds_transferred')).toBe('Transfer sent');
  expect(auditLabel('scheduled_payment_failed')).toBe('Scheduled payment failed');
});

it('shows a short reversal reference without exposing the internal reason', () => {
  const original = '256fcaa1-1234-4567-8901-123456789012';
  expect(
    ledgerReference(`Reversal of ${original}: internal test reason`, 'other-id')
  ).toBe('Reversal of DB-256F-CAA1');
});

it('uses the transaction reference for ordinary and malformed internal notes', () => {
  const id = '8f043910-1234-4567-8901-123456789012';
  for (const reference of [null, 'Internal note', 'Reversal of invalid: reason']) {
    expect(ledgerReference(reference, id)).toBe('DB-8F04-3910');
  }
});
