import { formatCentavosToPHP, phpToCentavos } from '../types';

describe('formatCentavosToPHP', () => {
  it('formats positive centavos to PHP currency string with commas', () => {
    expect(formatCentavosToPHP(100000)).toBe('₱1,000.00');
    expect(formatCentavosToPHP(500000000)).toBe('₱5,000,000.00');
    expect(formatCentavosToPHP(12345678)).toBe('₱123,456.78');
  });

  it('formats zero and small centavos amounts correctly', () => {
    expect(formatCentavosToPHP(0)).toBe('₱0.00');
    expect(formatCentavosToPHP(1)).toBe('₱0.01');
    expect(formatCentavosToPHP(99)).toBe('₱0.99');
    expect(formatCentavosToPHP(100)).toBe('₱1.00');
  });

  it('formats negative amounts correctly', () => {
    expect(formatCentavosToPHP(-500)).toBe('-₱5.00');
    expect(formatCentavosToPHP(-100000)).toBe('-₱1,000.00');
  });
});

describe('phpToCentavos', () => {
  it('converts standard PHP strings to integer centavos', () => {
    expect(phpToCentavos('100')).toBe(10000);
    expect(phpToCentavos('100.50')).toBe(10050);
    expect(phpToCentavos('1,000.25')).toBe(100025);
    expect(phpToCentavos('5,000,000.00')).toBe(500000000);
  });

  it('handles notorious IEEE-754 float drift and rounding edge cases without truncation', () => {
    // 19.99 * 100 in float is 1998.9999999999998; Math.round avoids truncating to 1998
    expect(phpToCentavos('19.99')).toBe(1999);
    expect(phpToCentavos('0.07')).toBe(7);
    expect(phpToCentavos('1.14')).toBe(114);
    expect(phpToCentavos('29.99')).toBe(2999);
    expect(phpToCentavos('100.01')).toBe(10001);
    expect(phpToCentavos('0.29')).toBe(29);
    expect(phpToCentavos('57.85')).toBe(5785);
  });

  it('handles invalid, empty, or negative input safely', () => {
    expect(phpToCentavos('')).toBe(0);
    expect(phpToCentavos('   ')).toBe(0);
    expect(phpToCentavos('invalid')).toBe(0);
    expect(phpToCentavos('-50')).toBe(-5000);
  });
});
