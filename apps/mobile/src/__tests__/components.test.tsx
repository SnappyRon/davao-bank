import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Button } from '../components/Button';
import { AmountText } from '../components/AmountText';
import { TransactionRow } from '../components/TransactionRow';
import { EmptyState } from '../components/EmptyState';
import type { TransactionHistoryItem } from '@davao-bank/shared';

// TransactionRow reads hideBalance from SettingsContext itself (spec 7B.2).
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({ hideBalance: false }),
}));

describe('Mobile Core UI Components', () => {
  describe('Button', () => {
    it('renders button title and fires onPress', async () => {
      const onPressMock = jest.fn();
      await render(<Button title="Continue" onPress={onPressMock} />);

      const btn = screen.getByText('Continue');
      expect(btn).toBeTruthy();

      fireEvent.press(btn);
      expect(onPressMock).toHaveBeenCalledTimes(1);
    });

    it('renders loading state and prevents onPress', async () => {
      const onPressMock = jest.fn();
      await render(<Button title="Submit" onPress={onPressMock} loading={true} />);

      const btn = screen.getByText('Submit');
      expect(btn).toBeTruthy();
      expect(
        screen.getByRole('button', { name: 'Submit' }).props.accessibilityState
      ).toEqual(expect.objectContaining({ busy: true, disabled: true }));

      fireEvent.press(btn);
      expect(onPressMock).not.toHaveBeenCalled();
    });

    it('prevents onPress when disabled', async () => {
      const onPressMock = jest.fn();
      await render(<Button title="Disabled" onPress={onPressMock} disabled={true} />);

      fireEvent.press(screen.getByText('Disabled'));
      expect(onPressMock).not.toHaveBeenCalled();
    });
  });

  describe('AmountText', () => {
    it('renders standard formatted PHP currency', async () => {
      await render(
        <AmountText amountCentavos={150000} direction="incoming" showSign={true} />
      );
      const amount = screen.getByText('+₱1,500.00');
      expect(amount.props.numberOfLines).toBe(1);
      expect(amount.props.adjustsFontSizeToFit).toBe(true);
      expect(amount.props.minimumFontScale).toBe(0.7);
      expect(amount.props.maxFontSizeMultiplier).toBe(1.4);
    });

    it('renders outgoing amount with minus sign', async () => {
      await render(
        <AmountText amountCentavos={25000} direction="outgoing" showSign={true} />
      );
      expect(screen.getByText('−₱250.00')).toBeTruthy();
    });

    it('renders masked state when hidden is true', async () => {
      await render(<AmountText amountCentavos={999900} hidden={true} />);
      const masked = screen.getByText('₱••••••');
      expect(masked.props.numberOfLines).toBe(1);
      expect(masked.props.maxFontSizeMultiplier).toBe(1.4);
      expect(screen.queryByText('₱9,999.00')).toBeNull();
    });
  });

  describe('TransactionRow', () => {
    const mockTransfer: TransactionHistoryItem = {
      account_id: 'acc-1',
      transaction_id: 'tx-12345678-abcd',
      ledger_entry_id: 'le-1',
      account_number: '1011111111',
      counterparty_account_number: '1022222222',
      direction: 'credit',
      amount: 50000,
      signed_amount: 50000,
      type: 'transfer',
      status: 'completed',
      reference: 'Dinner split',
      created_at: new Date('2026-11-04T10:00:00Z').toISOString(),
    };

    it('renders transaction details and responds to press', async () => {
      const onPress = jest.fn();
      await render(<TransactionRow transaction={mockTransfer} onPress={onPress} />);

      expect(screen.getByText('Received from •• 2222')).toBeTruthy();
      expect(screen.getByText('+₱500.00')).toBeTruthy();
      expect(screen.getByText(/From •• 2222/)).toBeTruthy();
      expect(screen.queryByText(/1022222222/)).toBeNull();

      fireEvent.press(screen.getByText('Received from •• 2222'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('renders "Reversed" badge for reversed state', async () => {
      const reversedTx: TransactionHistoryItem = {
        ...mockTransfer,
        status: 'reversed',
      };
      const { getByText } = await render(<TransactionRow transaction={reversedTx} />);
      expect(getByText('Reversed')).toBeTruthy();
    });

    it('renders "Pending" badge for pending state', async () => {
      const pendingTx: TransactionHistoryItem = {
        ...mockTransfer,
        status: 'pending',
      };
      const { getByText } = await render(<TransactionRow transaction={pendingTx} />);
      expect(getByText('Pending')).toBeTruthy();
    });

    it('renders "Failed" badge for failed state', async () => {
      const failedTx: TransactionHistoryItem = {
        ...mockTransfer,
        status: 'failed',
      };
      const { getByText } = await render(<TransactionRow transaction={failedTx} />);
      expect(getByText('Failed')).toBeTruthy();
    });
  });

  describe('EmptyState', () => {
    it('renders title, description, and action button', async () => {
      const onAction = jest.fn();
      const { getByText } = await render(
        <EmptyState
          title="No transactions yet"
          description="Your activity will show here"
          actionTitle="Make a Transfer"
          onAction={onAction}
        />
      );

      expect(getByText('No transactions yet')).toBeTruthy();
      expect(getByText('Your activity will show here')).toBeTruthy();

      const actionBtn = getByText('Make a Transfer');
      expect(actionBtn).toBeTruthy();

      fireEvent.press(actionBtn);
      expect(onAction).toHaveBeenCalledTimes(1);
    });
  });
});
