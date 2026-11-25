import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
    useIsFocused: () => true,
    usePreventRemove: jest.fn(),
  };
});

jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockRpc = jest.fn();
const mockListFactors = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, params?: unknown) => mockRpc(fn, params),
    auth: {
      mfa: { listFactors: () => mockListFactors() },
    },
  },
}));

const mockConfirmBiometricPayment = jest.fn();
let mockHideBalance = false;
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    hideBalance: mockHideBalance,
    confirmBiometricPayment: mockConfirmBiometricPayment,
  }),
}));

const mockPromptTotp = jest.fn();
jest.mock('../context/PasswordPromptContext', () => ({
  ...jest.requireActual('../context/PasswordPromptContext'),
  useTotpPrompt: () => mockPromptTotp,
}));

jest.mock('../context/AppLockContext', () => ({
  useAppLock: () => ({ enabled: true, setEnabled: jest.fn() }),
}));

const mockToastShow = jest.fn();
jest.mock('../components/Toast', () => ({
  ...jest.requireActual('../components/Toast'),
  useToast: () => ({ show: mockToastShow, dismiss: jest.fn() }),
}));

jest.mock('../components/StepUpSetupLink', () => ({ StepUpSetupLink: () => null }));

import { BantaySecurityScreen } from '../screens/BantaySecurityScreen';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

const DEFAULT_SETTINGS = {
  daily_transfer_limit_centavos: 5_000_000, // ₱50,000.00
  spent_today_centavos: 500_000, // ₱5,000.00
  remaining_today_centavos: 4_500_000, // ₱45,000.00
};

describe('BantaySecurityScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHideBalance = false;
    mockConfirmBiometricPayment.mockResolvedValue({ success: true });
    mockPromptTotp.mockResolvedValue({ success: true });
    mockListFactors.mockResolvedValue({
      data: { totp: [{ id: 'f-1', status: 'verified' }] },
      error: null,
    });
    mockRpc.mockResolvedValue({ data: DEFAULT_SETTINGS, error: null });
  });

  it('shows loading skeleton while security settings are loading', async () => {
    let resolveRpc!: (val: unknown) => void;
    mockRpc.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRpc = resolve;
      })
    );

    await render(<BantaySecurityScreen />);
    expect(screen.getByTestId('bantay-loading')).toBeTruthy();

    await act(async () => {
      resolveRpc({ data: DEFAULT_SETTINGS, error: null });
    });
    expect(await screen.findByText('₱50,000.00')).toBeTruthy();
  });

  it('shows empty state when settings return null and retries on Try again', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await render(<BantaySecurityScreen />);
    expect(await screen.findByText('No security settings')).toBeTruthy();

    mockRpc.mockResolvedValueOnce({ data: DEFAULT_SETTINGS, error: null });
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('₱50,000.00')).toBeTruthy();
  });

  it('shows error state and recovers on Try again', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'network request failed' },
    });

    await render(<BantaySecurityScreen />);
    expect(await screen.findByText('Security settings unavailable')).toBeTruthy();
    expect(screen.queryByText('₱0.00')).toBeNull();

    mockRpc.mockResolvedValueOnce({ data: DEFAULT_SETTINGS, error: null });
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('₱50,000.00')).toBeTruthy();
    expect(screen.getByText('₱5,000.00')).toBeTruthy();
    expect(screen.getByText('₱45,000.00')).toBeTruthy();
  });

  it('masks daily limit, spent today and remaining today when hideBalance is true', async () => {
    mockHideBalance = true;
    await render(<BantaySecurityScreen />);
    await screen.findByText('Daily transfer limit');
    expect(screen.getAllByText('₱••••••')).toHaveLength(3);
    expect(screen.queryByText('₱50,000.00')).toBeNull();
    expect(screen.queryByText('₱5,000.00')).toBeNull();
    expect(screen.queryByText('₱45,000.00')).toBeNull();
  });

  it('navigates to TwoStepSetup, ChangePassword and back for App lock', async () => {
    await render(<BantaySecurityScreen />);
    await screen.findByText('₱50,000.00');

    await fireEvent.press(screen.getByRole('button', { name: /Two-step verification/ }));
    expect(mockNavigate).toHaveBeenCalledWith('TwoStepSetup');

    await fireEvent.press(screen.getByRole('button', { name: 'Change password' }));
    expect(mockNavigate).toHaveBeenCalledWith('ChangePassword');

    await fireEvent.press(screen.getByRole('button', { name: /App lock/ }));
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('validates limit range and enforces step-up order before calling set_daily_limit', async () => {
    const callOrder: string[] = [];
    mockConfirmBiometricPayment.mockImplementation(async () => {
      callOrder.push('confirmBiometricPayment');
      return { success: true };
    });
    mockRpc.mockImplementation(async (fn: string) => {
      callOrder.push(`rpc:${fn}`);
      if (fn === 'get_security_settings') {
        return { data: DEFAULT_SETTINGS, error: null };
      }
      if (fn === 'set_daily_limit') {
        return {
          data: {
            daily_transfer_limit_centavos: 2_500_000,
            spent_today_centavos: 500_000,
            remaining_today_centavos: 2_000_000,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    await render(<BantaySecurityScreen />);
    await screen.findByText('₱50,000.00');

    await fireEvent.press(screen.getByRole('button', { name: 'Change daily limit' }));

    // Out-of-range validation
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '500');
    await fireEvent.press(screen.getByRole('button', { name: 'Save limit' }));
    expect(
      screen.getByText('Enter a limit between ₱1,000.00 and ₱500,000.00.')
    ).toBeTruthy();
    expect(mockConfirmBiometricPayment).not.toHaveBeenCalled();

    // Cancelled step-up aborts without calling set_daily_limit
    mockConfirmBiometricPayment.mockResolvedValueOnce({
      success: false,
      cancelled: true,
    });
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '25000');
    await fireEvent.press(screen.getByRole('button', { name: 'Save limit' }));
    expect(
      await screen.findByText('Not authorized. Daily limit was not changed.')
    ).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalledWith('set_daily_limit', expect.anything());

    // Valid save enforces confirmBiometricPayment -> set_daily_limit order
    callOrder.length = 0;
    await fireEvent.press(screen.getByRole('button', { name: 'Save limit' }));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('set_daily_limit', {
        p_limit_centavos: 2_500_000,
      })
    );
    expect(callOrder).toEqual(['confirmBiometricPayment', 'rpc:set_daily_limit']);
    expect(mockToastShow).toHaveBeenCalledWith('Daily limit updated');
    expect(await screen.findByText('₱25,000.00')).toBeTruthy();
    expect(screen.getByText('₱20,000.00')).toBeTruthy();
  });

  it('retries set_daily_limit with TOTP prompt when server returns STEP_UP_REQUIRED', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: DEFAULT_SETTINGS, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'STEP_UP_REQUIRED' } })
      .mockResolvedValueOnce({
        data: {
          daily_transfer_limit_centavos: 10_000_000,
          spent_today_centavos: 500_000,
          remaining_today_centavos: 9_500_000,
        },
        error: null,
      });

    await render(<BantaySecurityScreen />);
    await screen.findByText('₱50,000.00');

    await fireEvent.press(screen.getByRole('button', { name: 'Change daily limit' }));
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '100000');
    await fireEvent.press(screen.getByRole('button', { name: 'Save limit' }));

    await waitFor(() => expect(mockPromptTotp).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('₱100,000.00')).toBeTruthy();
  });
});
