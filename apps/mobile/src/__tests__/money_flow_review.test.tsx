import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ReviewCard } from '../components/ReviewCard';
import {
  commitButtonLabel,
  describeReferenceFormat,
  formatWhen,
  REVIEW_FOOTNOTE,
} from '../utils/moneyFlow';

describe('ReviewCard (spec 7B.4)', () => {
  it('shows the eyebrow, the amount with no sign, the rows and the footnote', async () => {
    await render(
      <ReviewCard
        eyebrow="You're sending"
        amountCentavos={-50000}
        rows={[
          { label: 'From', value: 'Savings •• 8921' },
          { label: 'To', value: '•• 7943' },
          { label: 'Note', value: '' },
          { label: 'When', value: 'Now' },
          { label: 'Fee', value: 'Free' },
        ]}
      />
    );
    expect(screen.getByText("You're sending")).toBeTruthy();
    expect(screen.getByText('₱500.00')).toBeTruthy();
    expect(screen.queryByText(/[−+-]₱/)).toBeNull();
    expect(screen.getByText('Savings •• 8921')).toBeTruthy();
    expect(screen.getByText('•• 7943')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
    // Rows without a value are left out.
    expect(screen.queryByText('Note')).toBeNull();
    expect(screen.getByText('Simulated money — no real funds move.')).toBeTruthy();
    expect(REVIEW_FOOTNOTE).toBe('Simulated money — no real funds move.');
  });

  it('makes a row with onPress a button (account picker)', async () => {
    const onPress = jest.fn();
    await render(
      <ReviewCard
        eyebrow="You're paying"
        amountCentavos={125000}
        rows={[{ label: 'From', value: 'Savings •• 8921', onPress }]}
      />
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'From: Savings •• 8921. Change account' })
    );
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('money flow copy', () => {
  it.each([
    ['send', 'Send ₱500.00', 'Sending…'],
    ['add', 'Add ₱500.00', 'Adding…'],
    ['cashOut', 'Cash out ₱500.00', 'Cashing out…'],
    ['pay', 'Pay ₱500.00', 'Paying…'],
    ['schedule', 'Schedule ₱500.00', 'Scheduling…'],
  ] as const)('names the money for %s and has a busy label', (action, idle, busy) => {
    expect(commitButtonLabel(action, 50000, false)).toBe(idle);
    expect(commitButtonLabel(action, 50000, true)).toBe(busy);
  });

  it('describes biller references with an example, never the regex', () => {
    expect(describeReferenceFormat('^[0-9]{10}$')).toBe('e.g. 10 digits, on your bill');
    expect(describeReferenceFormat('^[0-9]{8}$')).toBe('e.g. 8 digits, on your bill');
    expect(describeReferenceFormat('^09[0-9]{9}$')).toBe(
      'e.g. 11 digits starting with 09, on your bill'
    );
    expect(describeReferenceFormat('^[A-Z]{2}-\\d+$')).toBe(
      'e.g. the number on your bill'
    );
    for (const p of ['^[0-9]{10}$', '^09[0-9]{9}$', '^[A-Z]{2}-\\d+$']) {
      expect(describeReferenceFormat(p)).not.toMatch(/[\^$[\]{}\\]/);
    }
  });

  it('formats the When row', () => {
    expect(formatWhen('now', '2026-11-12', 'monthly')).toBe('Now');
    expect(formatWhen('later', '2026-11-12', 'monthly')).toBe('Once on Nov 12, 2026');
    expect(formatWhen('recurring', '2026-11-12', 'weekly', '4')).toBe(
      'Weekly from Nov 12, 2026 · 4 times'
    );
  });
});
