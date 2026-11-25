jest.mock('../context/PasswordPromptContext', () => ({
  ...jest.requireActual('../context/PasswordPromptContext'),
  useTotpPrompt: () => async () => ({ success: true }),
}));
jest.mock('../components/StepUpSetupLink', () => ({ StepUpSetupLink: () => null }));

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import {
  executeTransfer,
  fetchAccountBalances,
  type AccountBalance,
} from '@davao-bank/shared';
import type { RootStackParamList } from '../../App';

let mockRouteParams: RootStackParamList['Transfer'] = undefined;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), replace: jest.fn() }),
  useRoute: () => ({ params: mockRouteParams }),
  useIsFocused: () => true,
  usePreventRemove: jest.fn(),
}));
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockRpc = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [] }),
    })),
    rpc: (fn: string, params: unknown) => mockRpc(fn, params),
  },
}));

jest.mock('@davao-bank/shared', () => {
  const actual = jest.requireActual('@davao-bank/shared');
  return {
    ...actual,
    fetchAccountBalances: jest.fn(),
    executeTransfer: jest.fn().mockResolvedValue({
      data: {
        id: 'tx-mock-12345678',
        transaction_id: 'tx-mock-12345678',
        amount: 50000,
        status: 'completed',
        idempotent_replay: false,
      },
      error: null,
    }),
  };
});

const mockConfirmBiometricPayment = jest.fn();
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    hideBalance: false,
    confirmBiometricPayment: mockConfirmBiometricPayment,
  }),
}));

import { TransferScreen } from '../screens/TransferScreen';

const SAVINGS: AccountBalance = {
  account_id: 'acc-1111',
  user_id: 'user-1',
  account_number: '1012345678',
  type: 'savings',
  currency: 'PHP',
  status: 'active',
  balance: 5_000_000,
  ledger_entry_count: 1,
  last_activity_at: null,
};

describe('Transfer payee confirmation (Owner decision D9 — Review step only)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = undefined;
    mockConfirmBiometricPayment.mockResolvedValue({ success: true });
    jest.mocked(fetchAccountBalances).mockResolvedValue({
      data: [SAVINGS],
      error: null,
    });
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === 'lookup_payee') {
        return {
          data: { masked_name: 'J*** d*** C***', account_type: 'savings' },
          error: null,
        };
      }
      return { data: null, error: null };
    });
  });

  it('calls lookup_payee and shows masked name on Review step only, never on earlier or success steps', async () => {
    await render(<TransferScreen />);

    // Recipient step: lookup_payee NOT called and masked name NOT visible
    expect(await screen.findByLabelText('Account number')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalledWith('lookup_payee', expect.anything());
    expect(screen.queryByText('J*** d*** C***')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Account number'), '1099999999');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    // Amount step: lookup_payee NOT called and masked name NOT visible
    expect(await screen.findByPlaceholderText('0.00')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalledWith('lookup_payee', expect.anything());
    expect(screen.queryByText('J*** d*** C***')).toBeNull();

    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '500');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    // Review step: lookup_payee IS called and masked name IS visible
    expect(await screen.findByText('J*** d*** C***')).toBeTruthy();
    expect(screen.getByText('Account holder')).toBeTruthy();
    expect(screen.getByText('Savings')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('lookup_payee', {
      p_account_number: '1099999999',
    });

    // Success step: masked name is NOT shown
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send ₱500.00' }));
    });
    expect(await screen.findByText('Transfer sent')).toBeTruthy();
    expect(executeTransfer).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('J*** d*** C***')).toBeNull();
  });

  it('allows retrying lookup_payee on Review step when lookup fails without blocking transfer', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'network request failed' },
    });
    mockRouteParams = {
      recipientAccount: '1099999999',
      amountCentavos: 50000,
    };

    await render(<TransferScreen />);
    expect(await screen.findByText("Couldn't check account holder name.")).toBeTruthy();

    mockRpc.mockResolvedValueOnce({
      data: { masked_name: 'M*** R***', account_type: 'checking' },
      error: null,
    });
    await fireEvent.press(
      screen.getByRole('button', { name: 'Try again checking account holder' })
    );
    expect(await screen.findByText('M*** R***')).toBeTruthy();
    expect(screen.getByText('Checking')).toBeTruthy();
  });
});
