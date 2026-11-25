import { convertFXAmount, isFxRateStale } from '../utils/fx';

describe('convertFXAmount', () => {
  const rateDate = '2026-11-20';
  const referenceDate = new Date(2026, 10, 26); // 2026-11-26

  describe('PHP → FX', () => {
    it('converts PHP centavos to foreign-currency minor units', () => {
      // ₱100.00 at 58.95 PHP per USD → 10000 / 58.95 = 169.63... → 170 cents
      const result = convertFXAmount(10000, 58.95, 'PHP_TO_FX', rateDate, {
        referenceDate,
      });
      expect(result.resultMinor).toBe(170);
      expect(result.rate).toBe(58.95);
      expect(result.rateDate).toBe(rateDate);
    });

    it('rounds half up at the minor-unit boundary', () => {
      // 1 centavo at rate 2 → 0.5 → 1
      expect(
        convertFXAmount(1, 2, 'PHP_TO_FX', rateDate, { referenceDate }).resultMinor
      ).toBe(1);
      // 3 centavos at rate 2 → 1.5 → 2
      expect(
        convertFXAmount(3, 2, 'PHP_TO_FX', rateDate, { referenceDate }).resultMinor
      ).toBe(2);
    });

    it('handles IEEE-754 drift without truncation', () => {
      // ₱19.99 at 58.95 → 1999 / 58.95 = 33.9100... → 34
      expect(
        convertFXAmount(1999, 58.95, 'PHP_TO_FX', rateDate, {
          referenceDate,
        }).resultMinor
      ).toBe(34);
    });

    it('returns zero for non-positive amounts', () => {
      expect(
        convertFXAmount(0, 58.95, 'PHP_TO_FX', rateDate, { referenceDate }).resultMinor
      ).toBe(0);
      expect(
        convertFXAmount(-500, 58.95, 'PHP_TO_FX', rateDate, {
          referenceDate,
        }).resultMinor
      ).toBe(0);
    });
  });

  describe('FX → PHP', () => {
    it('converts foreign-currency minor units to PHP centavos', () => {
      // 170 USD cents at 58.95 → 10021.5 → 10022 centavos
      const result = convertFXAmount(170, 58.95, 'FX_TO_PHP', rateDate, {
        referenceDate,
      });
      expect(result.resultMinor).toBe(10022);
    });

    it('rounds half up at the minor-unit boundary', () => {
      // 1 cent at rate 2 → 2 centavos
      expect(
        convertFXAmount(1, 2, 'FX_TO_PHP', rateDate, { referenceDate }).resultMinor
      ).toBe(2);
      // 3 cents at rate 2 → 6 centavos
      expect(
        convertFXAmount(3, 2, 'FX_TO_PHP', rateDate, { referenceDate }).resultMinor
      ).toBe(6);
    });

    it('returns zero for non-positive amounts', () => {
      expect(
        convertFXAmount(0, 58.95, 'FX_TO_PHP', rateDate, { referenceDate }).resultMinor
      ).toBe(0);
    });
  });

  describe('invalid rates', () => {
    it('returns zero for a zero or negative rate', () => {
      expect(
        convertFXAmount(10000, 0, 'PHP_TO_FX', rateDate, { referenceDate }).resultMinor
      ).toBe(0);
      expect(
        convertFXAmount(10000, -1, 'FX_TO_PHP', rateDate, { referenceDate }).resultMinor
      ).toBe(0);
    });

    it('returns zero for a non-finite rate', () => {
      expect(
        convertFXAmount(10000, NaN, 'PHP_TO_FX', rateDate, {
          referenceDate,
        }).resultMinor
      ).toBe(0);
      expect(
        convertFXAmount(10000, Infinity, 'FX_TO_PHP', rateDate, {
          referenceDate,
        }).resultMinor
      ).toBe(0);
    });
  });

  describe('result shape', () => {
    it('passes rate and date through unchanged', () => {
      const result = convertFXAmount(10000, 58.95, 'PHP_TO_FX', rateDate, {
        referenceDate,
      });
      expect(result).toMatchObject({
        rate: 58.95,
        rateDate: '2026-11-20',
      });
    });

    it('defaults the reference date to now', () => {
      const result = convertFXAmount(10000, 58.95, 'PHP_TO_FX', rateDate);
      expect(typeof result.resultMinor).toBe('number');
      expect(typeof result.stale).toBe('boolean');
    });
  });
});

describe('isFxRateStale', () => {
  const referenceDate = new Date(2026, 10, 26); // 2026-11-26

  it('is not stale within the 3-day window', () => {
    expect(isFxRateStale('2026-11-26', referenceDate)).toBe(false);
    expect(isFxRateStale('2026-11-25', referenceDate)).toBe(false);
    expect(isFxRateStale('2026-11-24', referenceDate)).toBe(false);
    expect(isFxRateStale('2026-11-23', referenceDate)).toBe(false); // exactly 3 days
  });

  it('is stale after 3 days', () => {
    expect(isFxRateStale('2026-11-22', referenceDate)).toBe(true); // 4 days
    expect(isFxRateStale('2026-11-20', referenceDate)).toBe(true); // 6 days
  });

  it('respects a custom threshold', () => {
    expect(isFxRateStale('2026-11-24', referenceDate, 1)).toBe(true);
    expect(isFxRateStale('2026-11-25', referenceDate, 2)).toBe(false);
  });

  it('returns false for malformed dates', () => {
    expect(isFxRateStale('', referenceDate)).toBe(false);
    expect(isFxRateStale('not-a-date', referenceDate)).toBe(false);
  });
});
