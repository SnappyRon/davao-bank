import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import {
  fetchAccountBalances,
  fetchTransactionHistory,
  type AccountBalance,
  type TransactionHistoryItem,
} from '@davao-bank/shared';
import * as SecureStore from 'expo-secure-store';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
    useRoute: () => ({ params: mockRouteParams }),
    useFocusEffect: (callback: () => void) => {
      useEffect(() => callback(), [callback]);
    },
    useIsFocused: () => true,
    usePreventRemove: jest.fn(),
  };
});

jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

const mockSecureStore: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureStore[key] ?? null),
  setItemAsync: jest.fn(async (key: string, val: string) => {
    mockSecureStore[key] = val;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete mockSecureStore[key];
  }),
}));

const mockSetStringAsync = jest.fn(async (_text: string) => true);
jest.mock('expo-clipboard', () => ({
  setStringAsync: (text: string) => mockSetStringAsync(text),
}));

const mockToastShow = jest.fn();
jest.mock('../components/Toast', () => ({
  ...jest.requireActual('../components/Toast'),
  useToast: () => ({ show: mockToastShow, dismiss: jest.fn() }),
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: 'usr-1' } } })),
    },
  },
}));

jest.mock('@davao-bank/shared', () => {
  const actual = jest.requireActual('@davao-bank/shared');
  return {
    ...actual,
    fetchAccountBalances: jest.fn(),
    fetchTransactionHistory: jest.fn(),
  };
});

let mockHideBalance = false;
const mockToggleHideBalance = jest.fn(async () => {
  mockHideBalance = !mockHideBalance;
});
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    hideBalance: mockHideBalance,
    toggleHideBalance: mockToggleHideBalance,
  }),
}));

import { MyAccountsScreen, SHOW_ON_HOME_ACCOUNT_KEY } from '../screens/MyAccountsScreen';
import { AccountDetailScreen } from '../screens/AccountDetailScreen';
import { HomeBalanceCard } from '../screens/home/HomeBalanceCard';

const SAVINGS_ACC: AccountBalance = {
  account_id: 'acc-savings',
  user_id: 'usr-1',
  account_number: '1012348921',
  type: 'savings',
  currency: 'PHP',
  status: 'active',
  balance: 1500000, // ₱15,000.00
  ledger_entry_count: 5,
  last_activity_at: '2026-11-20T10:00:00Z',
};

const CHECKING_ACC: AccountBalance = {
  account_id: 'acc-checking',
  user_id: 'usr-1',
  account_number: '1078957943',
  type: 'checking',
  currency: 'PHP',
  status: 'active',
  balance: 500000, // ₱5,000.00
  ledger_entry_count: 2,
  last_activity_at: '2026-11-21T10:00:00Z',
};

const SAMPLE_TX: TransactionHistoryItem = {
  ledger_entry_id: 'led-1',
  transaction_id: 'tx-1',
  account_id: 'acc-savings',
  account_number: '1012348921',
  type: 'transfer',
  direction: 'credit',
  amount: 250000,
  signed_amount: 250000,
  status: 'completed',
  reference: null,
  counterparty_account_number: '1078957943',
  created_at: '2026-11-25T14:30:00Z',
};

describe('Stage 7D — My accounts and account detail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHideBalance = false;
    for (const k of Object.keys(mockSecureStore)) {
      delete mockSecureStore[k];
    }
    jest.mocked(fetchAccountBalances).mockResolvedValue({
      data: [SAVINGS_ACC, CHECKING_ACC],
      error: null,
    });
    jest.mocked(fetchTransactionHistory).mockResolvedValue({
      data: [SAMPLE_TX],
      error: null,
    });
  });

  describe('HomeBalanceCard interactions (7D-a)', () => {
    it('tapping balance card navigates to My accounts', async () => {
      const onPressCard = jest.fn();
      await render(
        <HomeBalanceCard
          loading={false}
          error={null}
          accounts={[SAVINGS_ACC, CHECKING_ACC]}
          selectedAccount={SAVINGS_ACC}
          hideBalance={false}
          onOpenAccountPicker={jest.fn()}
          onToggleHideBalance={jest.fn()}
          onRetry={jest.fn()}
          onPressCard={onPressCard}
        />
      );

      const card = screen.getByLabelText('Available balance, see My accounts');
      await fireEvent.press(card);
      expect(onPressCard).toHaveBeenCalledTimes(1);
    });

    it('eye button toggles hideBalance and does not navigate', async () => {
      const onPressCard = jest.fn();
      const onToggleHideBalance = jest.fn();
      await render(
        <HomeBalanceCard
          loading={false}
          error={null}
          accounts={[SAVINGS_ACC, CHECKING_ACC]}
          selectedAccount={SAVINGS_ACC}
          hideBalance={false}
          onOpenAccountPicker={jest.fn()}
          onToggleHideBalance={onToggleHideBalance}
          onRetry={jest.fn()}
          onPressCard={onPressCard}
        />
      );

      const eyeBtn = screen.getByRole('button', { name: 'Hide balance' });
      await fireEvent.press(eyeBtn);
      expect(onToggleHideBalance).toHaveBeenCalledTimes(1);
      expect(onPressCard).not.toHaveBeenCalled();
    });

    it('account pill opens account picker and does not navigate', async () => {
      const onPressCard = jest.fn();
      const onOpenAccountPicker = jest.fn();
      await render(
        <HomeBalanceCard
          loading={false}
          error={null}
          accounts={[SAVINGS_ACC, CHECKING_ACC]}
          selectedAccount={SAVINGS_ACC}
          hideBalance={false}
          onOpenAccountPicker={onOpenAccountPicker}
          onToggleHideBalance={jest.fn()}
          onRetry={jest.fn()}
          onPressCard={onPressCard}
        />
      );

      const pill = screen.getByRole('button', {
        name: 'Savings •• 8921. Change account',
      });
      await fireEvent.press(pill);
      expect(onOpenAccountPicker).toHaveBeenCalledTimes(1);
      expect(onPressCard).not.toHaveBeenCalled();
    });
  });

  describe('MyAccountsScreen (7D-a.1 - 7D-a.3)', () => {
    it('renders combined balance header and account rows with type, last4 and badge', async () => {
      await render(<MyAccountsScreen />);

      // Combined balance = 15,000 + 5,000 = ₱20,000.00
      expect(await screen.findByText('₱20,000.00')).toBeTruthy();
      expect(screen.getByText('COMBINED BALANCE')).toBeTruthy();
      expect(screen.getByText('2 accounts')).toBeTruthy();

      // Account rows
      expect(screen.getByText('Savings •• 8921')).toBeTruthy();
      expect(screen.getByText('₱15,000.00')).toBeTruthy();
      expect(screen.getByText('Checking •• 7943')).toBeTruthy();
      expect(screen.getByText('₱5,000.00')).toBeTruthy();
      expect(screen.getAllByText('Active').length).toBe(2);
    });

    it('toggles hideBalance on eye button press', async () => {
      await render(<MyAccountsScreen />);

      const eyeBtn = await screen.findByRole('button', { name: 'Hide balance' });
      await fireEvent.press(eyeBtn);
      expect(mockToggleHideBalance).toHaveBeenCalledTimes(1);
    });

    it('tapping an account row navigates to AccountDetail', async () => {
      await render(<MyAccountsScreen />);

      const savingsRow = await screen.findByRole('button', {
        name: 'Savings •• 8921, see account detail',
      });
      await fireEvent.press(savingsRow);

      expect(mockNavigate).toHaveBeenCalledWith('AccountDetail', {
        accountId: 'acc-savings',
        account: SAVINGS_ACC,
      });
    });

    it('"Show on Home" saves preference to SecureStore', async () => {
      await render(<MyAccountsScreen />);

      const showOnHomeBtn = await screen.findByLabelText(
        'Show Savings •• 8921 on Home, currently disabled'
      );
      await fireEvent.press(showOnHomeBtn);

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        SHOW_ON_HOME_ACCOUNT_KEY,
        'acc-savings'
      );
    });

    it('shows error state with Try again on load failure', async () => {
      jest.mocked(fetchAccountBalances).mockResolvedValueOnce({
        data: null,
        error: 'Network request failed',
      });

      await render(<MyAccountsScreen />);

      expect(await screen.findByText('Accounts unavailable')).toBeTruthy();
      const retryBtn = screen.getByRole('button', { name: 'Try again' });
      await fireEvent.press(retryBtn);
      expect(fetchAccountBalances).toHaveBeenCalledTimes(2);
    });
  });

  describe('AccountDetailScreen (7D-a.4)', () => {
    beforeEach(() => {
      mockRouteParams = {
        accountId: 'acc-savings',
        account: SAVINGS_ACC,
      };
    });

    it('renders balance, status badge and masked account number', async () => {
      await render(<AccountDetailScreen />);

      expect(await screen.findByText('Savings •• 8921')).toBeTruthy();
      expect(screen.getByText('₱15,000.00')).toBeTruthy();
      expect(screen.getByText('Active')).toBeTruthy();
      expect(screen.getByText('•••• •••• 8921')).toBeTruthy();
    });

    it('eye toggle reveals full 10-digit account number on demand', async () => {
      await render(<AccountDetailScreen />);

      expect(await screen.findByText('•••• •••• 8921')).toBeTruthy();
      const revealBtn = screen.getByRole('button', {
        name: 'Show full account number',
      });
      await fireEvent.press(revealBtn);

      expect(await screen.findByText('1012348921')).toBeTruthy();
      expect(screen.queryByText('•••• •••• 8921')).toBeNull();
    });

    it('copy button copies account number and shows toast', async () => {
      await render(<AccountDetailScreen />);

      const copyBtn = await screen.findByRole('button', {
        name: 'Copy account number',
      });
      await fireEvent.press(copyBtn);

      expect(mockSetStringAsync).toHaveBeenCalledWith('1012348921');
      expect(mockToastShow).toHaveBeenCalledWith('Account number copied');
    });

    it('renders recent transactions for this account', async () => {
      await render(<AccountDetailScreen />);

      expect(await screen.findByText('Recent transactions')).toBeTruthy();
      expect(screen.getByText('Received from •• 7943')).toBeTruthy();
      expect(screen.getByText(/2,500\.00/)).toBeTruthy();
    });

    it('"See all" navigates to Activity filtered by accountId', async () => {
      await render(<AccountDetailScreen />);

      const seeAllBtn = await screen.findByRole('button', {
        name: 'See all activity',
      });
      await fireEvent.press(seeAllBtn);

      expect(mockNavigate).toHaveBeenCalledWith('Tabs', {
        screen: 'ActivityTab',
        params: { accountId: 'acc-savings' },
      });
    });

    it('shows empty state when account has no transactions', async () => {
      jest.mocked(fetchTransactionHistory).mockResolvedValueOnce({
        data: [],
        error: null,
      });

      await render(<AccountDetailScreen />);

      expect(await screen.findByText('No activity yet')).toBeTruthy();
      expect(
        screen.getByText('Transactions for this account will appear here.')
      ).toBeTruthy();
    });
  });
});
