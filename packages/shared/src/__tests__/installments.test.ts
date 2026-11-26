import {
  INSTALLMENT_OFFERS,
  INSTALLMENT_TERMS,
  MAX_INSTALLMENT_CENTAVOS,
  MIN_INSTALLMENT_CENTAVOS,
  addOnRateToAnnualRate,
  annualRateToAddOnRate,
  computeAmortization,
  formatInstallmentRate,
  isInstallmentTerm,
  offerForTerm,
} from '../utils/installments';

describe('installment offers', () => {
  it('offers the four terms from the spec', () => {
    expect([...INSTALLMENT_TERMS]).toEqual([3, 6, 12, 24]);
    expect(INSTALLMENT_OFFERS.map((offer) => offer.termMonths)).toEqual([3, 6, 12, 24]);
  });

  it('exposes an add-on rate for every offered term', () => {
    for (const term of INSTALLMENT_TERMS) {
      const offer = offerForTerm(term);
      expect(offer).not.toBeNull();
      expect(offer!.addOnRate).toBeGreaterThan(0);
      expect(offer!.addOnRate).toBeLessThan(1);
    }
    expect(offerForTerm(9)).toBeNull();
  });

  it('guards saved-quote term values', () => {
    expect(isInstallmentTerm(6)).toBe(true);
    expect(isInstallmentTerm('6')).toBe(false);
    expect(isInstallmentTerm(7)).toBe(false);
  });

  it('converts between add-on and simple annual rate', () => {
    expect(addOnRateToAnnualRate(0.029, 3)).toBeCloseTo(0.116, 10);
    expect(addOnRateToAnnualRate(0.115, 12)).toBeCloseTo(0.115, 10);
    expect(annualRateToAddOnRate(0.116, 3)).toBeCloseTo(0.029, 10);
    expect(annualRateToAddOnRate(0, 12)).toBe(0);
    expect(addOnRateToAnnualRate(0.1, 0)).toBe(0);
    expect(formatInstallmentRate(0.115)).toBe('11.5%');
  });
});

describe('computeAmortization', () => {
  it('rounds interest to whole centavos, including half-centavo cases', () => {
    expect(computeAmortization(1, 3, 0.5).totalInterestCents).toBe(1);
    expect(computeAmortization(3, 3, 0.5).totalInterestCents).toBe(2);
    const quote = computeAmortization(1_000_001, 12, 0.115);
    expect(Number.isInteger(quote.totalInterestCents)).toBe(true);
    expect(quote.totalInterestCents).toBe(Math.round(1_000_001 * 0.115));
    expect(quote.totalPayableCents).toBe(1_000_001 + quote.totalInterestCents);
  });

  it('adjusts the final payment so the schedule sums exactly', () => {
    // ₱1,000.00 over 3 months at a 10% add-on rate: regular rows are 36,666
    // centavos and the last row absorbs the two remaining centavos.
    const quote = computeAmortization(100_000, 3, 0.1);
    expect(quote.monthlyCents).toBe(36_666);
    expect(quote.totalInterestCents).toBe(10_000);
    expect(quote.totalPayableCents).toBe(110_000);
    expect(quote.schedule).toHaveLength(3);
    expect(quote.schedule[0].paymentCents).toBe(36_666);
    expect(quote.schedule[1].paymentCents).toBe(36_666);
    expect(quote.schedule[2].paymentCents).toBe(36_668);
    expect(quote.schedule.reduce((sum, row) => sum + row.paymentCents, 0)).toBe(
      quote.totalPayableCents
    );
    expect(quote.schedule.reduce((sum, row) => sum + row.interestCents, 0)).toBe(
      quote.totalInterestCents
    );
    expect(quote.schedule.reduce((sum, row) => sum + row.principalCents, 0)).toBe(
      quote.principalCents
    );
    expect(quote.schedule[2].remainingBalanceCents).toBe(0);
  });

  it('keeps every month balanced for each offer', () => {
    for (const offer of INSTALLMENT_OFFERS) {
      for (const principal of [
        MIN_INSTALLMENT_CENTAVOS,
        123_457,
        1_000_000,
        MAX_INSTALLMENT_CENTAVOS,
      ]) {
        const quote = computeAmortization(principal, offer.termMonths, offer.addOnRate);
        expect(quote.schedule).toHaveLength(offer.termMonths);
        expect(quote.schedule.reduce((sum, row) => sum + row.paymentCents, 0)).toBe(
          quote.totalPayableCents
        );
        for (const row of quote.schedule) {
          expect(row.paymentCents).toBe(row.principalCents + row.interestCents);
          expect(row.remainingBalanceCents).toBeGreaterThanOrEqual(0);
        }
        expect(quote.schedule[quote.schedule.length - 1].remainingBalanceCents).toBe(0);
      }
    }
  });

  it('returns an empty quote for invalid input', () => {
    expect(computeAmortization(0, 12, 0.1).schedule).toEqual([]);
    expect(computeAmortization(-100, 12, 0.1).schedule).toEqual([]);
    expect(computeAmortization(100.5, 12, 0.1).schedule).toEqual([]);
    expect(computeAmortization(100_000, 0, 0.1).schedule).toEqual([]);
    expect(computeAmortization(100_000, 12, NaN).schedule).toEqual([]);
    expect(computeAmortization(100_000, 12, 1).schedule).toEqual([]);
  });
});
