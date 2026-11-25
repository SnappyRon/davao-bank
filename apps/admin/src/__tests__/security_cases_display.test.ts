import {
  caseIdFromSlug,
  caseSlug,
  eventSignals,
  maskAccountNumber,
  maskCustomerName,
  maskEmail,
} from '@/lib/securityCases';

const CASE_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('Bantay security case presentation', () => {
  it('hides raw ids in routes but round-trips the case id', () => {
    const slug = caseSlug(CASE_ID);
    expect(slug).not.toContain(CASE_ID);
    expect(caseIdFromSlug(slug)).toBe(CASE_ID);
    expect(caseIdFromSlug('not-a-case')).toBeNull();
  });

  it('masks names, emails and account numbers', () => {
    expect(maskCustomerName('Juan dela Cruz')).toBe('J*** d*** C***');
    expect(maskEmail('customer1@davaobank.ph')).toBe('c•••@d•••');
    expect(maskAccountNumber('1020000002')).toBe('•••• 0002');
    expect(maskCustomerName(null)).toBe('C***');
    expect(maskEmail(null)).toBe('•••');
    expect(maskAccountNumber(null)).toBe('•••• ••••');
  });

  it('renders only whitelisted risk signals', () => {
    expect(
      eventSignals({
        signals: ['new_payee', 'high_amount', 'drop table users', 42],
        to_account_id: CASE_ID,
        note: 'secret customer note',
      })
    ).toEqual(['New payee', 'Large amount']);
    expect(eventSignals({})).toEqual([]);
  });
});
