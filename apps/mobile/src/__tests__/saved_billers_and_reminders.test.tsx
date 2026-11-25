jest.mock('../context/PasswordPromptContext', () => ({
  ...jest.requireActual('../context/PasswordPromptContext'),
  useTotpPrompt: () => async () => ({ success: true }),
}));
jest.mock('../components/StepUpSetupLink', () => ({ StepUpSetupLink: () => null }));

import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import {
  fetchAccountBalances,
  fetchTransactionHistory,
  fetchUserProfile,
  fetchHealthCheck,
  type AccountBalance,
} from '@davao-bank/shared';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: jest.fn(),
      replace: jest.fn(),
    }),
    useRoute: () => ({ params: undefined }),
    useFocusEffect: (cb: () => void) => useEffect(() => cb(), [cb]),
    useIsFocused: () => true,
    usePreventRemove: jest.fn(),
  };
});
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

const BILLER = {
  id: 'biller-1',
  name: 'Apo Fiber Internet (demo)',
  category: 'internet',
  account_id: 'acc-biller',
  reference_label: 'Subscriber No.',
  reference_pattern: '^[0-9]{10}$',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
};

const SAVED_BILLER = {
  id: 'sb-1',
  user_id: 'usr-1',
  biller_id: 'biller-1',
  reference: '1234567890',
  nickname: 'Home Fiber',
  due_day: 15,
  remind: true,
  created_at: '2026-11-01T00:00:00Z',
};

let mockSavedBillersRes: { data: unknown; error: unknown } = {
  data: [SAVED_BILLER],
  error: null,
};
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockRpc = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: 'usr-1' } }, error: null })),
    },
    from: (table: string) => {
      if (table === 'billers') {
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = () => b;
        b.order = () => Promise.resolve({ data: [BILLER], error: null });
        return b;
      }
      if (table === 'saved_billers') {
        return {
          select: () => ({
            order: () => Promise.resolve(mockSavedBillersRes),
          }),
          insert: (payload: unknown) => {
            mockInsert(payload);
            return Promise.resolve({ error: null });
          },
          update: (payload: unknown) => ({
            eq: (col: string, val: unknown) => {
              mockUpdate(payload, col, val);
              return Promise.resolve({ error: null });
            },
          }),
          delete: () => ({
            eq: (col: string, val: unknown) => {
              mockDelete(col, val);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      const empty: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit']) empty[m] = () => empty;
      empty.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null, count: 0 }).then(res);
      return empty;
    },
    rpc: (fn: string, params?: unknown) => mockRpc(fn, params),
  },
}));

jest.mock('@davao-bank/shared', () => {
  const actual = jest.requireActual('@davao-bank/shared');
  return {
    ...actual,
    fetchUserProfile: jest.fn(),
    fetchAccountBalances: jest.fn(),
    fetchTransactionHistory: jest.fn(),
    fetchHealthCheck: jest.fn(),
  };
});

const mockConfirmBiometricPayment = jest.fn();
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    hideBalance: false,
    toggleHideBalance: jest.fn(),
    confirmBiometricPayment: mockConfirmBiometricPayment,
  }),
}));

const mockToastShow = jest.fn();
jest.mock('../components/Toast', () => ({
  ...jest.requireActual('../components/Toast'),
  useToast: () => ({ show: mockToastShow, dismiss: jest.fn() }),
}));

import { PayBillsScreen } from '../screens/PayBillsScreen';
import { HomeScreen } from '../screens/HomeScreen';

const SAVINGS: AccountBalance = {
  account_id: 'acc-s',
  user_id: 'usr-1',
  account_number: '1012348921',
  type: 'savings',
  currency: 'PHP',
  status: 'active',
  balance: 500_000,
  ledger_entry_count: 1,
  last_activity_at: null,
};

describe('Saved billers in PayBillsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSavedBillersRes = { data: [SAVED_BILLER], error: null };
    mockConfirmBiometricPayment.mockResolvedValue({ success: true });
    mockRpc.mockResolvedValue({ data: { id: 'tx-bill-1' }, error: null });
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [SAVINGS], error: null });
  });

  it('shows empty saved billers state when user has none', async () => {
    mockSavedBillersRes = { data: [], error: null };
    await render(<PayBillsScreen />);
    expect(await screen.findByText('No saved billers yet')).toBeTruthy();
  });

  it('shows error and retries loading saved billers', async () => {
    mockSavedBillersRes = { data: null, error: { message: 'network request failed' } };
    await render(<PayBillsScreen />);
    expect(
      await screen.findByText('You appear to be offline. Nothing was sent.')
    ).toBeTruthy();

    mockSavedBillersRes = { data: [SAVED_BILLER], error: null };
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Home Fiber')).toBeTruthy();
  });

  it('tapping a saved biller pre-fills biller and reference and opens Amount step', async () => {
    await render(<PayBillsScreen />);
    await fireEvent.press(
      await screen.findByRole('button', {
        name: 'Pay Home Fiber, Apo Fiber Internet (demo), 1234567890',
      })
    );
    expect(await screen.findByLabelText('To Apo Fiber Internet (demo)')).toBeTruthy();
    expect(screen.getByText('Step 3 of 4')).toBeTruthy();
  });

  it('edits saved biller nickname and due day, and deletes via confirmation sheet', async () => {
    await render(<PayBillsScreen />);
    await screen.findByText('Home Fiber');

    await fireEvent.press(screen.getByRole('button', { name: 'Edit Home Fiber' }));
    await fireEvent.changeText(screen.getByLabelText('Nickname'), 'Condo WiFi');
    await fireEvent.changeText(screen.getByLabelText('Due day (1–28, optional)'), '20');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        { nickname: 'Condo WiFi', due_day: 20, remind: true },
        'id',
        'sb-1'
      )
    );
    expect(mockToastShow).toHaveBeenCalledWith('Saved biller updated');

    await fireEvent.press(screen.getByRole('button', { name: 'Remove Home Fiber' }));
    const sheet = screen.getByTestId('bottom-sheet-modal');
    await fireEvent.press(within(sheet).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('id', 'sb-1'));
    expect(mockToastShow).toHaveBeenCalledWith('Saved biller removed');
  });

  it('offers Save this biller after paying and inserts into saved_billers', async () => {
    mockSavedBillersRes = { data: [], error: null };
    await render(<PayBillsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: /Apo Fiber/ }));
    await fireEvent.changeText(screen.getByLabelText('Subscriber No.'), '9876543210');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '1250');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Pay ₱1,250.00' }));
    });

    expect(await screen.findByRole('header', { name: 'Bill paid' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save this biller' }));
    await fireEvent.changeText(screen.getByLabelText('Nickname'), 'Office Fiber');
    await fireEvent.changeText(screen.getByLabelText('Due day (1–28, optional)'), '10');
    await fireEvent.press(screen.getByRole('button', { name: 'Save biller' }));

    await waitFor(() =>
      expect(mockInsert).toHaveBeenCalledWith({
        user_id: 'usr-1',
        biller_id: 'biller-1',
        reference: '9876543210',
        nickname: 'Office Fiber',
        due_day: 10,
        remind: true,
      })
    );
    expect(mockToastShow).toHaveBeenCalledWith('Biller saved');
    expect(await screen.findByText('Saved to your billers')).toBeTruthy();
  });
});

describe('Bill reminders on HomeScreen Coming up card', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fetchUserProfile).mockResolvedValue({
      data: { id: 'usr-1', full_name: 'Juan Dela Cruz', status: 'active' },
      error: null,
    } as never);
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [SAVINGS], error: null });
    jest.mocked(fetchTransactionHistory).mockResolvedValue({ data: [], error: null });
    jest.mocked(fetchHealthCheck).mockResolvedValue({ data: null, error: null } as never);
  });

  it('shows bill reminders from get_bill_reminders on Coming up and navigates to PayBills', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'sb-1',
          biller_id: 'biller-1',
          biller_name: 'Apo Fiber Internet',
          nickname: 'Home Fiber',
          reference: '1234567890',
          due_day: 25,
          days_until_due: 0,
        },
        {
          id: 'sb-2',
          biller_id: 'biller-2',
          biller_name: 'Davao Light',
          nickname: 'House Power',
          reference: '5556667778',
          due_day: 28,
          days_until_due: 3,
        },
      ],
      error: null,
    });

    await render(<HomeScreen />);
    expect(await screen.findByText('Coming up')).toBeTruthy();
    expect(screen.getByText('Home Fiber')).toBeTruthy();
    expect(screen.getByText('Apo Fiber Internet · Due today')).toBeTruthy();
    expect(screen.getByText('Davao Light · Due in 3 days')).toBeTruthy();
    expect(screen.getAllByText('Bill due')).toHaveLength(2);

    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Home Fiber, Apo Fiber Internet · Due today, Bill due',
      })
    );
    expect(mockNavigate).toHaveBeenCalledWith('PayBills', {
      billerId: 'biller-1',
      reference: '1234567890',
    });
  });
});
