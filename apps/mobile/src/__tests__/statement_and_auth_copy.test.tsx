import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import { fetchAccountBalances, type AccountBalance } from '@davao-bank/shared';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
  useIsFocused: () => true,
  usePreventRemove: jest.fn(),
}));
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn().mockResolvedValue({ uri: 'file:///statement.pdf' }),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { UTF8: 'utf8' },
}));
const mockToastShow = jest.fn();
jest.mock('../components/Toast', () => ({
  ...jest.requireActual('../components/Toast'),
  useToast: () => ({ show: mockToastShow, dismiss: jest.fn() }),
}));
const mockRpc = jest.fn();
const mockRefreshSession = jest.fn();
const mockResend = jest.fn();
const mockResetPassword = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, params: unknown) => mockRpc(fn, params),
    auth: {
      refreshSession: () => mockRefreshSession(),
      resend: (args: unknown) => mockResend(args),
      resetPasswordForEmail: (email: string) => mockResetPassword(email),
    },
  },
}));
jest.mock('@davao-bank/shared', () => ({
  ...jest.requireActual('@davao-bank/shared'),
  fetchAccountBalances: jest.fn(),
}));
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({ hideBalance: false }),
}));

import { ExportStatementScreen } from '../screens/ExportStatementScreen';
import { VerifyEmailScreen } from '../screens/VerifyEmailScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';

const SAVINGS: AccountBalance = {
  account_id: 'acc-s',
  user_id: 'u',
  account_number: '1012348921',
  type: 'savings',
  currency: 'PHP',
  status: 'active',
  balance: 500000,
  ledger_entry_count: 0,
  last_activity_at: null,
};

describe('Export statement (spec 7B.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [SAVINGS], error: null });
    mockRpc.mockResolvedValue({
      data: {
        account_number: '1012348921',
        period_from: '2026-11-01',
        period_to: '2026-11-10',
        opening_balance: 0,
        closing_balance: 500000,
        transactions: [],
      },
      error: null,
    });
  });

  it.each([['Download PDF Statement'], ['Export CSV Spreadsheet']])(
    '%s shows "Statement ready" before the share sheet opens',
    async (buttonName) => {
      await render(<ExportStatementScreen />);
      const button = await screen.findByRole('button', { name: buttonName });
      await act(async () => {
        fireEvent.press(button);
      });
      expect(mockToastShow).toHaveBeenCalledWith('Statement ready');
      expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
      expect(mockToastShow.mock.invocationCallOrder[0]).toBeLessThan(
        jest.mocked(Sharing.shareAsync).mock.invocationCallOrder[0]
      );
    }
  );
});

describe('Verify email (spec 7B.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('"I\'ve verified my email" refreshes the session so the gate re-runs', async () => {
    const onNavigateToLogin = jest.fn();
    mockRefreshSession.mockResolvedValue({
      data: { session: { user: { email_confirmed_at: null } } },
      error: null,
    });
    await render(
      <VerifyEmailScreen email="new@davaobank.ph" onNavigateToLogin={onNavigateToLogin} />
    );
    expect(
      screen.getByText(
        'Tap the link in the email, then come back and tap "I\'ve verified".'
      )
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: "I've verified my email" }));
    });
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/isn't verified yet/)).toBeTruthy();
    expect(onNavigateToLogin).not.toHaveBeenCalled();
  });

  it('sends a signed-out user to sign in, which runs the same gate', async () => {
    const onNavigateToLogin = jest.fn();
    mockRefreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Auth session missing!' },
    });
    await render(
      <VerifyEmailScreen email="new@davaobank.ph" onNavigateToLogin={onNavigateToLogin} />
    );
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: "I've verified my email" }));
    });
    expect(onNavigateToLogin).toHaveBeenCalledTimes(1);
  });

  it('Resend has a 60 s cooldown with a visible countdown', async () => {
    mockResend.mockResolvedValue({ error: null });
    await render(
      <VerifyEmailScreen email="new@davaobank.ph" onNavigateToLogin={jest.fn()} />
    );
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Resend email' }));
    });
    expect(mockResend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'new@davaobank.ph',
    });
    const cooling = screen.getByRole('button', { name: 'Resend in 60 s' });
    expect(cooling.props.accessibilityState).toMatchObject({ disabled: true });
    // One tick per second: each tick schedules the next.
    for (let i = 0; i < 18; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }
    expect(screen.getByRole('button', { name: 'Resend in 42 s' })).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Resend in 42 s' }));
    });
    expect(mockResend).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 42; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }
    expect(screen.getByRole('button', { name: 'Resend email' })).toBeTruthy();
  });
});

describe('Forgot password (spec 7B.4)', () => {
  it('tells the user to finish the reset in the browser, then sign in here', async () => {
    mockResetPassword.mockResolvedValue({ error: null });
    await render(<ForgotPasswordScreen onNavigateToLogin={jest.fn()} />);
    await fireEvent.changeText(screen.getByPlaceholderText('name@example.com'), 'a@b.ph');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
    });
    expect(mockResetPassword).toHaveBeenCalledWith('a@b.ph');
    expect(
      screen.getByText(
        'Check your email. Open the link in the email to set a new password, then sign in here.'
      )
    ).toBeTruthy();
  });
});
