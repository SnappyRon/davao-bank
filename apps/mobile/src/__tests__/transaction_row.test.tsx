import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { colors, type TransactionHistoryItem } from '@davao-bank/shared';

let mockHideBalance = false;
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({ hideBalance: mockHideBalance }),
}));

import { TransactionRow } from '../components/TransactionRow';
import { Badge, transactionStatusBadge, type BadgeVariant } from '../components/Badge';
import {
  LIST_DISC_SIZE,
  LIST_HAIRLINE_INSET,
  LIST_ROW_GAP,
  LIST_ROW_PADDING_HORIZONTAL,
} from '../components/GroupedList';
import {
  buildReversalOriginals,
  findReversalOriginal,
  reversedTransactionId,
} from '../utils/transactionDisplay';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

const ORIGINAL_ID = '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';

const sent: TransactionHistoryItem = {
  ledger_entry_id: 'le-sent',
  transaction_id: ORIGINAL_ID,
  account_id: 'acc-savings',
  account_number: '1011118921',
  counterparty_account_number: '1022228720',
  direction: 'debit',
  amount: 50000,
  signed_amount: -50000,
  type: 'transfer',
  status: 'completed',
  reference: 'Rent',
  created_at: '2026-11-10T02:41:00',
};

const reversal: TransactionHistoryItem = {
  ledger_entry_id: 'le-rev',
  transaction_id: '9a8b7c6d-0000-4000-8000-000000000001',
  account_id: 'acc-savings',
  account_number: '1011118921',
  counterparty_account_number: null,
  direction: 'credit',
  amount: 50000,
  signed_amount: 50000,
  type: 'reversal',
  status: 'completed',
  reference: `Reversal of ${ORIGINAL_ID}: Sent to the wrong account`,
  created_at: '2026-11-10T05:00:00',
};

describe('TransactionRow (7B.2)', () => {
  beforeEach(() => {
    mockHideBalance = false;
  });

  it('masks the counterparty in title and meta (last 4 only) and shows the time', async () => {
    await render(<TransactionRow transaction={sent} />);
    expect(screen.getByText('Sent to •• 8720')).toBeTruthy();
    expect(screen.getByText('To •• 8720 · 2:41 AM')).toBeTruthy();
    expect(screen.queryByText(/1022228720/)).toBeNull();
    expect(screen.getByText('−₱500.00')).toBeTruthy();
  });

  it('prefixes the account on Activity: "Savings · To •• 8720"', async () => {
    await render(<TransactionRow transaction={sent} accountLabel="Savings" />);
    expect(screen.getByText('Savings · To •• 8720 · 2:41 AM')).toBeTruthy();
  });

  it('includes the amount in the accessibility label', async () => {
    await render(<TransactionRow transaction={sent} onPress={jest.fn()} />);
    expect(
      screen.getByRole('button', {
        name: 'Sent to •• 8720, To •• 8720 · 2:41 AM, minus ₱500.00',
      })
    ).toBeTruthy();
  });

  it('reads hideBalance itself: masked amount and "amount hidden" label', async () => {
    mockHideBalance = true;
    await render(<TransactionRow transaction={sent} onPress={jest.fn()} />);
    expect(screen.getByText('₱••••••')).toBeTruthy();
    expect(screen.queryByText('−₱500.00')).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'Sent to •• 8720, To •• 8720 · 2:41 AM, amount hidden',
      })
    ).toBeTruthy();
  });

  it('caps amount text scaling at 1.4', async () => {
    await render(<TransactionRow transaction={sent} />);
    expect(screen.getByText('−₱500.00').props.maxFontSizeMultiplier).toBe(1.4);
  });

  it('shows no badge for completed rows in lists', async () => {
    await render(<TransactionRow transaction={sent} />);
    expect(screen.queryByText('Completed')).toBeNull();
  });

  it('titles received transfers and bank credits in sentence case', async () => {
    await render(
      <TransactionRow
        transaction={{
          ...sent,
          direction: 'credit',
          counterparty_account_number: '1033338921',
        }}
      />
    );
    expect(screen.getByText('Received from •• 8921')).toBeTruthy();
    expect(screen.getByText('+₱500.00')).toBeTruthy();

    await render(
      <TransactionRow
        transaction={{
          ...sent,
          type: 'adjustment',
          direction: 'credit',
          counterparty_account_number: null,
          reference: null,
        }}
      />
    );
    expect(screen.getByText('Bank credit')).toBeTruthy();
  });
});

describe('Bill payments (fix round)', () => {
  const bill: TransactionHistoryItem = {
    ...sent,
    type: 'bill_payment',
    counterparty_account_number: '9990001234',
    reference: null,
  };

  it('never shows the internal billers account number', async () => {
    await render(<TransactionRow transaction={bill} onPress={jest.fn()} />);
    expect(screen.getByText('Bill payment')).toBeTruthy();
    expect(screen.getByText('2:41 AM')).toBeTruthy();
    expect(screen.queryByText(/1234/)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Bill payment, 2:41 AM, minus ₱500.00' })
    ).toBeTruthy();
  });

  it('shows the note in the meta when there is one', async () => {
    await render(<TransactionRow transaction={{ ...bill, reference: 'October' }} />);
    expect(screen.getByText('October · 2:41 AM')).toBeTruthy();
  });

  it('titles the row with the biller name when history has it (7B.9)', async () => {
    await render(
      <TransactionRow
        transaction={{ ...bill, biller_name: 'Apo Fiber' }}
        onPress={jest.fn()}
      />
    );
    expect(screen.getByText('Bill payment · Apo Fiber')).toBeTruthy();
    expect(screen.queryByText(/1234/)).toBeNull();
  });
});

describe('Reversals (7B.2)', () => {
  it('reads the original id from the reversal reference format', () => {
    expect(reversedTransactionId(reversal)).toBe(ORIGINAL_ID);
    expect(
      reversedTransactionId({ ...reversal, reference: 'Something else' })
    ).toBeNull();
    expect(reversedTransactionId(sent)).toBeNull();
    expect(findReversalOriginal(reversal, [sent, reversal])).toBe(sent);
    expect(buildReversalOriginals([sent, reversal]).get('le-rev')).toBe(sent);
  });

  it('titles the reversal row "Reversal · Transfer to •• 8720" without showing the id', async () => {
    await render(<TransactionRow transaction={reversal} reversalOf={sent} />);
    expect(screen.getByText('Reversal · Transfer to •• 8720')).toBeTruthy();
    expect(screen.queryByText(new RegExp(ORIGINAL_ID))).toBeNull();
    expect(screen.queryByText(/wrong account/)).toBeNull();
  });

  it('uses the same deposit label as the row ("Money added")', async () => {
    const deposit: TransactionHistoryItem = {
      ...sent,
      type: 'deposit',
      direction: 'credit',
      counterparty_account_number: null,
    };
    await render(<TransactionRow transaction={deposit} />);
    expect(screen.getByText('Money added')).toBeTruthy();
    await render(<TransactionRow transaction={reversal} reversalOf={deposit} />);
    expect(screen.getByText('Reversal · Money added')).toBeTruthy();
  });

  it('falls back to "Reversal" when the original is not loaded', async () => {
    await render(<TransactionRow transaction={reversal} />);
    expect(screen.getByText('Reversal')).toBeTruthy();
  });

  it('strikes through the original amount in muted text with a neutral Reversed badge', async () => {
    await render(<TransactionRow transaction={{ ...sent, status: 'reversed' }} />);
    const amount = screen.getByText('−₱500.00');
    expect(amount).toHaveStyle({
      textDecorationLine: 'line-through',
      color: colors.textMuted,
    });
    expect(screen.getByText('Reversed')).toHaveStyle({ color: colors.textSecondary });
  });
});

describe('Badge colours (7B.2 table)', () => {
  const cases: [BadgeVariant, string, string][] = [
    ['completed', colors.primary, colors.primaryTint],
    ['pending', colors.orangeText, colors.tintOrange],
    ['scheduled', colors.blueText, colors.tintBlue],
    ['failed', colors.redText, colors.tintRed],
    ['reversed', colors.textSecondary, colors.surfaceSubtle],
    ['cancelled', colors.textSecondary, colors.surfaceSubtle],
  ];

  it.each(cases)('%s uses its text and background colours', async (variant, text, bg) => {
    await render(<Badge label="Label" variant={variant} testID="badge" />);
    expect(screen.getByText('Label')).toHaveStyle({ color: text });
    expect(screen.getByTestId('badge')).toHaveStyle({
      backgroundColor: bg,
      minHeight: 24,
    });
  });

  it('maps statuses: Completed only on receipts', () => {
    expect(transactionStatusBadge('completed', 'list')).toBeNull();
    expect(transactionStatusBadge('completed', 'receipt')).toEqual({
      label: 'Completed',
      variant: 'completed',
    });
    expect(transactionStatusBadge('reversed', 'list')?.variant).toBe('reversed');
    expect(transactionStatusBadge('pending', 'list')?.variant).toBe('pending');
    expect(transactionStatusBadge('failed', 'list')?.variant).toBe('failed');
  });
});

describe('Shared list metrics', () => {
  it('insets hairlines 72 = padding 16 + disc 40 + gap 16', () => {
    expect(LIST_HAIRLINE_INSET).toBe(
      LIST_ROW_PADDING_HORIZONTAL + LIST_DISC_SIZE + LIST_ROW_GAP
    );
    expect(LIST_HAIRLINE_INSET).toBe(72);
  });
});
