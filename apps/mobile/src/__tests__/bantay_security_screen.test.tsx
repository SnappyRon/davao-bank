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
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'get_security_timeline') {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: DEFAULT_SETTINGS, error: null });
    });
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
    let limitCallCount = 0;
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'get_security_settings') {
        return Promise.resolve({ data: DEFAULT_SETTINGS, error: null });
      }
      if (fn === 'get_security_timeline') {
        return Promise.resolve({ data: [], error: null });
      }
      if (fn === 'set_daily_limit') {
        limitCallCount++;
        if (limitCallCount === 1) {
          return Promise.resolve({ data: null, error: { message: 'STEP_UP_REQUIRED' } });
        }
        return Promise.resolve({
          data: {
            daily_transfer_limit_centavos: 10_000_000,
            spent_today_centavos: 500_000,
            remaining_today_centavos: 9_500_000,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    await render(<BantaySecurityScreen />);
    await screen.findByText('₱50,000.00');

    await fireEvent.press(screen.getByRole('button', { name: 'Change daily limit' }));
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '100000');
    await fireEvent.press(screen.getByRole('button', { name: 'Save limit' }));

    await waitFor(() => expect(mockPromptTotp).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('₱100,000.00')).toBeTruthy();
  });

  describe('Status card & Lock / Unlock flow (§1.1)', () => {
    it('shows Protected status and allows locking account with confirmation', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'get_security_settings') {
          return Promise.resolve({
            data: { ...DEFAULT_SETTINGS, locked: false },
            error: null,
          });
        }
        if (fn === 'get_security_timeline') {
          return Promise.resolve({ data: [], error: null });
        }
        if (fn === 'lock_my_account') {
          return Promise.resolve({ data: { success: true }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      await render(<BantaySecurityScreen />);
      expect(await screen.findByText('Protected')).toBeTruthy();
      expect(screen.getByText('Bantay is watching your account')).toBeTruthy();
      expect(
        screen.getAllByText('Outgoing transfers and bills are checked').length
      ).toBeGreaterThanOrEqual(1);

      // Press "Lock my account"
      await fireEvent.press(screen.getByRole('button', { name: 'Lock my account' }));
      // Confirm sheet appears with title "Lock account"
      expect(screen.getAllByText('Lock account').length).toBeGreaterThanOrEqual(1);
      expect(
        screen.getByText(/Locked accounts can’t send or receive money/)
      ).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Lock account' }));

      await waitFor(() =>
        expect(mockRpc).toHaveBeenCalledWith('lock_my_account', undefined)
      );
    });

    it('shows Locked status and requests unlock', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'get_security_settings') {
          return Promise.resolve({
            data: { ...DEFAULT_SETTINGS, locked: true, unlock_after: null },
            error: null,
          });
        }
        if (fn === 'get_security_timeline') {
          return Promise.resolve({ data: [], error: null });
        }
        if (fn === 'request_unlock') {
          return Promise.resolve({
            data: {
              ...DEFAULT_SETTINGS,
              locked: true,
              unlock_after: new Date(Date.now() + 3600000).toISOString(),
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      await render(<BantaySecurityScreen />);
      expect(await screen.findByText('Account locked')).toBeTruthy();
      expect(screen.getByText('Bantay is guarding your locked account')).toBeTruthy();
      expect(
        screen.getAllByText('Locked for outgoing money').length
      ).toBeGreaterThanOrEqual(1);

      const requestUnlockBtn = screen.getByRole('button', { name: 'Request unlock' });
      await fireEvent.press(requestUnlockBtn);

      await waitFor(() =>
        expect(mockRpc).toHaveBeenCalledWith('request_unlock', undefined)
      );
    });

    it('shows countdown when unlock_after is in future', async () => {
      const futureDate = new Date(Date.now() + 1800000).toISOString(); // 30 mins
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'get_security_settings') {
          return Promise.resolve({
            data: { ...DEFAULT_SETTINGS, locked: true, unlock_after: futureDate },
            error: null,
          });
        }
        if (fn === 'get_security_timeline') {
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      await render(<BantaySecurityScreen />);
      expect(await screen.findByText('Account locked')).toBeTruthy();
      expect(screen.getAllByText(/You can unlock at/).length).toBeGreaterThanOrEqual(1);
      const unlockBtn = screen.getByRole('button', { name: 'Unlock account' });
      expect(unlockBtn.props.accessibilityState?.disabled).toBe(true);
    });

    it('shows ready status and completes unlock when unlock_after is past', async () => {
      const pastDate = new Date(Date.now() - 60000).toISOString(); // 1 min ago
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'get_security_settings') {
          return Promise.resolve({
            data: { ...DEFAULT_SETTINGS, locked: true, unlock_after: pastDate },
            error: null,
          });
        }
        if (fn === 'get_security_timeline') {
          return Promise.resolve({ data: [], error: null });
        }
        if (fn === 'complete_unlock') {
          return Promise.resolve({
            data: { ...DEFAULT_SETTINGS, locked: false, unlock_after: null },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      await render(<BantaySecurityScreen />);
      expect(
        screen.getAllByText('Unlock request is ready').length
      ).toBeGreaterThanOrEqual(1);
      const unlockBtn = screen.getByRole('button', { name: 'Unlock account' });
      expect(unlockBtn.props.accessibilityState?.disabled).toBe(false);

      await fireEvent.press(unlockBtn);
      await waitFor(() =>
        expect(mockRpc).toHaveBeenCalledWith('complete_unlock', undefined)
      );
    });
  });

  describe('Security timeline & Event handling (§1.3)', () => {
    const mockEvents = [
      {
        id: 'evt-1',
        kind: 'new_device',
        severity: 'high',
        status: 'open',
        explanation: 'Signed in from an unrecognized Android device in Davao City.',
        facts: { device: 'Android', city: 'Davao City' },
        created_at: new Date().toISOString(),
      },
      {
        id: 'evt-2',
        kind: 'risky_payment_challenged',
        severity: 'medium',
        status: 'open',
        explanation: null, // template fallback test
        facts: { amount_band: '5000_10000', payee_suffix: '1234' },
        created_at: new Date().toISOString(),
      },
    ];

    it('renders timeline with events and template fallback', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'get_security_settings') {
          return Promise.resolve({ data: DEFAULT_SETTINGS, error: null });
        }
        if (fn === 'get_security_timeline') {
          return Promise.resolve({ data: mockEvents, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      await render(<BantaySecurityScreen />);
      expect(await screen.findByText('Security timeline')).toBeTruthy();
      expect(screen.getByText('New device sign-in')).toBeTruthy();
      expect(
        screen.getByText('Signed in from an unrecognized Android device in Davao City.')
      ).toBeTruthy();

      // Template fallback for event 2
      expect(screen.getByText('Payment review required')).toBeTruthy();
      expect(
        screen.getByText(
          /A payment of about ₱5,000–₱10,000 to •• 1234 needed extra confirmation/
        )
      ).toBeTruthy();
    });

    it('marks event as confirmed with "This was me"', async () => {
      mockRpc.mockImplementation((fn: string, params?: any) => {
        if (fn === 'get_security_settings') {
          return Promise.resolve({ data: DEFAULT_SETTINGS, error: null });
        }
        if (fn === 'get_security_timeline') {
          return Promise.resolve({ data: [mockEvents[0]], error: null });
        }
        if (fn === 'mark_event') {
          expect(params).toEqual({
            p_event_id: 'evt-1',
            p_status: 'confirmed_me',
          });
          return Promise.resolve({ data: { success: true }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      await render(<BantaySecurityScreen />);
      await screen.findByText('New device sign-in');

      const thisWasMeBtn = screen.getByRole('button', {
        name: 'This was me, New device sign-in',
      });
      await fireEvent.press(thisWasMeBtn);

      await waitFor(() =>
        expect(mockRpc).toHaveBeenCalledWith('mark_event', {
          p_event_id: 'evt-1',
          p_status: 'confirmed_me',
        })
      );
      expect(mockToastShow).toHaveBeenCalledWith('Confirmed as you');
    });

    it('marks event as not me and locks account', async () => {
      mockRpc.mockImplementation((fn: string, params?: any) => {
        if (fn === 'get_security_settings') {
          return Promise.resolve({ data: DEFAULT_SETTINGS, error: null });
        }
        if (fn === 'get_security_timeline') {
          return Promise.resolve({ data: [mockEvents[0]], error: null });
        }
        if (fn === 'mark_event') {
          expect(params).toEqual({
            p_event_id: 'evt-1',
            p_status: 'reported_not_me',
          });
          return Promise.resolve({ data: { success: true }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      await render(<BantaySecurityScreen />);
      await screen.findByText('New device sign-in');

      const notMeBtn = screen.getByRole('button', {
        name: 'Not me, New device sign-in',
      });
      await fireEvent.press(notMeBtn);

      // Confirm sheet appears
      expect(screen.getByText('Report suspicious activity')).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Report & lock' }));

      await waitFor(() =>
        expect(mockRpc).toHaveBeenCalledWith('mark_event', {
          p_event_id: 'evt-1',
          p_status: 'reported_not_me',
        })
      );
      expect(mockToastShow).toHaveBeenCalledWith('Reported activity');
    });
  });
});
