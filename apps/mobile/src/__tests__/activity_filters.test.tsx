import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('expo-blur', () => ({ BlurView: () => null }));

jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({ hideBalance: false }),
}));

import {
  ActivityFilterSheet,
  DEFAULT_ACTIVITY_FILTERS,
  countActiveFilters,
  matchesDateRange,
  type ActivityFilterState,
} from '../components/ActivityFilterSheet';
import { TransactionRow } from '../components/TransactionRow';
import type { TransactionHistoryItem } from '@davao-bank/shared';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('ActivityFilterSheet and filtering logic (7D-b)', () => {
  describe('countActiveFilters', () => {
    it('returns 0 for default filters', () => {
      expect(countActiveFilters(DEFAULT_ACTIVITY_FILTERS)).toBe(0);
    });

    it('counts each active filter category', () => {
      const filters: ActivityFilterState = {
        types: ['transfer', 'deposit'],
        datePreset: '30_days',
        direction: 'in',
        status: 'completed',
      };
      expect(countActiveFilters(filters)).toBe(4);
    });

    it('counts partial active filters accurately', () => {
      const filters: ActivityFilterState = {
        ...DEFAULT_ACTIVITY_FILTERS,
        direction: 'out',
      };
      expect(countActiveFilters(filters)).toBe(1);
    });
  });

  describe('matchesDateRange', () => {
    // Construct local-time dates to be timezone-independent
    const now = new Date(2026, 10, 26, 12, 0, 0); // Nov 26, 2026 12:00 local

    it('returns true for any date when preset is "all"', () => {
      const past = new Date(2020, 0, 1).toISOString();
      expect(matchesDateRange(past, 'all', null, null, now)).toBe(true);
    });

    it('correctly filters for "today"', () => {
      const todayDate = new Date(2026, 10, 26, 8, 0, 0).toISOString();
      const yesterdayDate = new Date(2026, 10, 25, 12, 0, 0).toISOString();

      expect(matchesDateRange(todayDate, 'today', null, null, now)).toBe(true);
      expect(matchesDateRange(yesterdayDate, 'today', null, null, now)).toBe(false);
    });

    it('correctly filters for "7_days"', () => {
      const threeDaysAgo = new Date(2026, 10, 23, 12, 0, 0).toISOString();
      const tenDaysAgo = new Date(2026, 10, 16, 12, 0, 0).toISOString();

      expect(matchesDateRange(threeDaysAgo, '7_days', null, null, now)).toBe(true);
      expect(matchesDateRange(tenDaysAgo, '7_days', null, null, now)).toBe(false);
    });

    it('correctly filters for "30_days"', () => {
      const fifteenDaysAgo = new Date(2026, 10, 11, 12, 0, 0).toISOString();
      const fortyDaysAgo = new Date(2026, 9, 15, 12, 0, 0).toISOString();

      expect(matchesDateRange(fifteenDaysAgo, '30_days', null, null, now)).toBe(true);
      expect(matchesDateRange(fortyDaysAgo, '30_days', null, null, now)).toBe(false);
    });

    it('correctly filters for "this_month"', () => {
      const thisMonth = new Date(2026, 10, 2, 12, 0, 0).toISOString();
      const lastMonth = new Date(2026, 9, 28, 12, 0, 0).toISOString();

      expect(matchesDateRange(thisMonth, 'this_month', null, null, now)).toBe(true);
      expect(matchesDateRange(lastMonth, 'this_month', null, null, now)).toBe(false);
    });

    it('correctly filters for "custom" date range', () => {
      const inRange = new Date(2026, 4, 15, 12, 0, 0).toISOString();
      const outOfRange = new Date(2026, 5, 2, 12, 0, 0).toISOString();

      expect(matchesDateRange(inRange, 'custom', '2026-05-01', '2026-05-31', now)).toBe(
        true
      );
      expect(
        matchesDateRange(outOfRange, 'custom', '2026-05-01', '2026-05-31', now)
      ).toBe(false);
    });
  });

  describe('ActivityFilterSheet component interactions', () => {
    it('renders all filter sections with options', async () => {
      await render(
        <ActivityFilterSheet
          visible={true}
          onClose={jest.fn()}
          filters={DEFAULT_ACTIVITY_FILTERS}
          onApply={jest.fn()}
          onClear={jest.fn()}
        />
      );

      expect(screen.getByText('Filters')).toBeTruthy();
      expect(screen.getByText('Transaction type')).toBeTruthy();
      expect(screen.getByText('Date range')).toBeTruthy();
      expect(screen.getByText('Direction')).toBeTruthy();
      expect(screen.getByText('Status')).toBeTruthy();

      expect(screen.getByRole('button', { name: 'Transfers' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Bill payments' })).toBeTruthy();
      expect(screen.getByRole('button', { name: '30 days' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy();
    });

    it('toggles transaction types and applies them', async () => {
      const mockApply = jest.fn();
      await render(
        <ActivityFilterSheet
          visible={true}
          onClose={jest.fn()}
          filters={DEFAULT_ACTIVITY_FILTERS}
          onApply={mockApply}
          onClear={jest.fn()}
        />
      );

      await fireEvent.press(screen.getByRole('button', { name: 'Transfers' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Cash in' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Out' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Apply' }));

      expect(mockApply).toHaveBeenCalledWith(
        expect.objectContaining({
          types: ['transfer', 'deposit'],
          direction: 'out',
        })
      );
    });

    it('clears filters when Clear button is pressed', async () => {
      const mockClear = jest.fn();
      await render(
        <ActivityFilterSheet
          visible={true}
          onClose={jest.fn()}
          filters={{
            types: ['transfer'],
            datePreset: '7_days',
            direction: 'in',
            status: 'completed',
          }}
          onApply={jest.fn()}
          onClear={mockClear}
        />
      );

      await fireEvent.press(screen.getByRole('button', { name: 'Clear' }));
      expect(mockClear).toHaveBeenCalledTimes(1);
    });

    it('reveals custom date fields when Custom is selected', async () => {
      await render(
        <ActivityFilterSheet
          visible={true}
          onClose={jest.fn()}
          filters={DEFAULT_ACTIVITY_FILTERS}
          onApply={jest.fn()}
          onClear={jest.fn()}
        />
      );

      expect(screen.queryByPlaceholderText('YYYY-MM-DD')).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: 'Custom' }));

      expect(screen.getByLabelText('Start date')).toBeTruthy();
      expect(screen.getByLabelText('End date')).toBeTruthy();
    });
  });

  describe('TransactionRow large amount formatting (7D-b.5)', () => {
    const hugeTx: TransactionHistoryItem = {
      ledger_entry_id: 'le-huge',
      transaction_id: 'tx-huge',
      account_id: 'acc-1',
      account_number: '1011118921',
      counterparty_account_number: '1022227943',
      direction: 'credit',
      amount: 10000000000, // ₱100,000,000.00
      signed_amount: 10000000000,
      type: 'transfer',
      status: 'completed',
      reference: 'Major funding transfer',
      created_at: '2026-11-26T10:00:00Z',
    };

    it('renders ₱100,000,000.00 tabular amount without clipping or wrapping mid-number', async () => {
      await render(<TransactionRow transaction={hugeTx} />);

      expect(screen.getByText('Received from •• 7943')).toBeTruthy();
      expect(screen.getByText('+₱100,000,000.00')).toBeTruthy();
      expect(screen.getByText('+₱100,000,000.00').props.maxFontSizeMultiplier).toBe(1.4);
    });
  });
});
