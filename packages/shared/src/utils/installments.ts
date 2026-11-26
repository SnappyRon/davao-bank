/**
 * Davao Bank — installment quote helpers (Phase 9 · 9G).
 *
 * Pure, on-device amortization for reference terms. No network call,
 * no account balance change, no credit check and no approval. All money is
 * integer centavos; the only floating-point step is the rate multiplication,
 * which is rounded to whole centavos immediately.
 */

/** Terms offered in the calculator (spec §4.6). */
export const INSTALLMENT_TERMS = [3, 6, 12, 24] as const;
export type InstallmentTermMonths = (typeof INSTALLMENT_TERMS)[number];

/** Smallest and largest quote amounts accepted by the screen (centavos). */
export const MIN_INSTALLMENT_CENTAVOS = 10_000; // ₱100.00
export const MAX_INSTALLMENT_CENTAVOS = 100_000_000; // ₱1,000,000.00

export interface InstallmentOffer {
  termMonths: InstallmentTermMonths;
  /**
   * Add-on (flat) rate charged on the whole principal for the whole term.
   * Example: 0.115 means 11.5% of the principal over 12 months.
   */
  addOnRate: number;
}

/**
 * Reference rates only. They are not a Davao Bank price list and do
 * not represent a credit offer. The yearly equivalent stays near 11–12%.
 */
export const INSTALLMENT_OFFERS: readonly InstallmentOffer[] = [
  { termMonths: 3, addOnRate: 0.029 },
  { termMonths: 6, addOnRate: 0.058 },
  { termMonths: 12, addOnRate: 0.115 },
  { termMonths: 24, addOnRate: 0.228 },
];

/** Type guard for values coming from a saved local quote or a route param. */
export function isInstallmentTerm(value: unknown): value is InstallmentTermMonths {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    (INSTALLMENT_TERMS as readonly number[]).includes(value)
  );
}

export function offerForTerm(termMonths: number): InstallmentOffer | null {
  return INSTALLMENT_OFFERS.find((offer) => offer.termMonths === termMonths) ?? null;
}

/**
 * Simple yearly equivalent of an add-on rate: addOnRate × 12 / termMonths.
 * This is a disclosure aid, not an effective-interest-rate calculation.
 */
export function addOnRateToAnnualRate(addOnRate: number, termMonths: number): number {
  if (
    !Number.isFinite(addOnRate) ||
    addOnRate < 0 ||
    !Number.isFinite(termMonths) ||
    termMonths <= 0
  ) {
    return 0;
  }
  return (addOnRate * 12) / termMonths;
}

/** Inverse of `addOnRateToAnnualRate`, for an annual-rate display basis. */
export function annualRateToAddOnRate(annualRate: number, termMonths: number): number {
  if (
    !Number.isFinite(annualRate) ||
    annualRate < 0 ||
    !Number.isFinite(termMonths) ||
    termMonths <= 0
  ) {
    return 0;
  }
  return (annualRate * termMonths) / 12;
}

/** Rate as a sentence-case display string, e.g. 0.115 → "11.5%". */
export function formatInstallmentRate(rate: number): string {
  if (!Number.isFinite(rate) || rate < 0) return '0.0%';
  return `${(rate * 100).toFixed(1)}%`;
}

export interface InstallmentScheduleRow {
  /** One-based payment number. */
  month: number;
  /** Amount due this month, in centavos. */
  paymentCents: number;
  /** Principal repaid this month, in centavos. */
  principalCents: number;
  /** Interest allocated to this month, in centavos. */
  interestCents: number;
  /** Principal left after this payment, in centavos. */
  remainingBalanceCents: number;
}

export interface AmortizationQuote {
  principalCents: number;
  termMonths: number;
  factorRate: number;
  /** Regular monthly payment; the final row absorbs any centavo remainder. */
  monthlyCents: number;
  totalPayableCents: number;
  totalInterestCents: number;
  schedule: InstallmentScheduleRow[];
}

function emptyQuote(): AmortizationQuote {
  return {
    principalCents: 0,
    termMonths: 0,
    factorRate: 0,
    monthlyCents: 0,
    totalPayableCents: 0,
    totalInterestCents: 0,
    schedule: [],
  };
}

/**
 * Add-on (factor-rate) amortization in integer centavos.
 *
 * - interest = round(principal × factorRate)
 * - regular principal and interest shares are floored to whole centavos
 * - the final payment receives every leftover centavo, so the schedule always
 *   sums exactly to principal + interest and ends at a zero balance
 *
 * Invalid input returns an empty quote rather than throwing, so a partially
 * typed amount never produces a misleading number. Pure: no state or I/O.
 */
export function computeAmortization(
  principalCents: number,
  termMonths: number,
  factorRate: number
): AmortizationQuote {
  if (
    !Number.isInteger(principalCents) ||
    principalCents <= 0 ||
    !Number.isInteger(termMonths) ||
    termMonths <= 0 ||
    !Number.isFinite(factorRate) ||
    factorRate < 0 ||
    factorRate >= 1
  ) {
    return emptyQuote();
  }

  const totalInterestCents = Math.round(principalCents * factorRate);
  const totalPayableCents = principalCents + totalInterestCents;
  const principalPerMonth = Math.floor(principalCents / termMonths);
  const interestPerMonth = Math.floor(totalInterestCents / termMonths);
  const monthlyCents = principalPerMonth + interestPerMonth;

  const schedule: InstallmentScheduleRow[] = [];
  let remainingBalanceCents = principalCents;
  for (let month = 1; month <= termMonths; month += 1) {
    const isFinal = month === termMonths;
    const principalPart = isFinal ? remainingBalanceCents : principalPerMonth;
    const interestPart = isFinal
      ? totalInterestCents - interestPerMonth * (termMonths - 1)
      : interestPerMonth;
    remainingBalanceCents -= principalPart;
    schedule.push({
      month,
      paymentCents: principalPart + interestPart,
      principalCents: principalPart,
      interestCents: interestPart,
      remainingBalanceCents,
    });
  }

  return {
    principalCents,
    termMonths,
    factorRate,
    monthlyCents,
    totalPayableCents,
    totalInterestCents,
    schedule,
  };
}
