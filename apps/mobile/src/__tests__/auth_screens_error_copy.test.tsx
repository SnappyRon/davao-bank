import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, dispatch: jest.fn() }),
  useIsFocused: () => true,
  usePreventRemove: jest.fn(),
}));
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();
const mockResetPasswordForEmail = jest.fn();
const mockRefreshSession = jest.fn();
const mockResend = jest.fn();
const mockUpdateUser = jest.fn();
const mockListFactors = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (args: unknown) => mockSignInWithPassword(args),
      signUp: (args: unknown) => mockSignUp(args),
      resetPasswordForEmail: (email: string) => mockResetPasswordForEmail(email),
      refreshSession: () => mockRefreshSession(),
      resend: (args: unknown) => mockResend(args),
      updateUser: (attrs: unknown) => mockUpdateUser(attrs),
      mfa: {
        listFactors: () => mockListFactors(),
      },
    },
  },
}));

const mockPromptPassword = jest.fn();
const mockPromptTotp = jest.fn();
jest.mock('../context/PasswordPromptContext', () => ({
  ...jest.requireActual('../context/PasswordPromptContext'),
  usePasswordPrompt: () => (options: unknown) => mockPromptPassword(options),
  useTotpPrompt: () => () => mockPromptTotp(),
}));

import { LoginScreen } from '../screens/LoginScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { ChangePasswordScreen } from '../screens/ChangePasswordScreen';
import { VerifyEmailScreen } from '../screens/VerifyEmailScreen';

describe('Auth screens error copy (never mentions money)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPromptPassword.mockResolvedValue({ success: true });
    mockPromptTotp.mockResolvedValue({ success: true });
    mockListFactors.mockResolvedValue({ data: { totp: [] }, error: null });
  });

  describe('LoginScreen', () => {
    it('shows safe fallback error without money copy on unexpected failure', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'internal server failure 500' },
      });

      await render(
        <LoginScreen
          onNavigateToSignUp={jest.fn()}
          onNavigateToForgotPassword={jest.fn()}
          onNavigateToVerifyEmail={jest.fn()}
        />
      );

      await fireEvent.changeText(
        screen.getByPlaceholderText('name@example.com'),
        'user@davaobank.ph'
      );
      await fireEvent.changeText(screen.getByPlaceholderText('••••••••'), 'Secret1234');
      await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

      expect(await screen.findByText('Something went wrong. Try again.')).toBeTruthy();
      expect(screen.queryByText(/money/i)).toBeNull();
    });

    it('shows offline copy without money text on network failure', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'Network request failed' },
      });

      await render(
        <LoginScreen
          onNavigateToSignUp={jest.fn()}
          onNavigateToForgotPassword={jest.fn()}
          onNavigateToVerifyEmail={jest.fn()}
        />
      );

      await fireEvent.changeText(
        screen.getByPlaceholderText('name@example.com'),
        'user@davaobank.ph'
      );
      await fireEvent.changeText(screen.getByPlaceholderText('••••••••'), 'Secret1234');
      await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

      expect(
        await screen.findByText(
          'You appear to be offline. Check your connection and try again.'
        )
      ).toBeTruthy();
      expect(screen.queryByText(/money/i)).toBeNull();
    });
  });

  describe('SignUpScreen', () => {
    it('shows safe fallback error without money copy on unexpected failure', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'Database connection failed' },
      });

      await render(
        <SignUpScreen onNavigateToLogin={jest.fn()} onSignUpSuccess={jest.fn()} />
      );

      await fireEvent.changeText(
        screen.getByLabelText('Full legal name'),
        'Maria Santos'
      );
      await fireEvent.changeText(screen.getByLabelText('Email'), 'new@davaobank.ph');
      await fireEvent.changeText(
        screen.getByLabelText('Password (min 6 characters)'),
        'Secret1234'
      );
      await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'Secret1234');
      await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

      expect(await screen.findByText('Something went wrong. Try again.')).toBeTruthy();
      expect(screen.queryByText(/money/i)).toBeNull();
    });

    it('shows offline copy without money text on network failure', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'Failed to fetch' },
      });

      await render(
        <SignUpScreen onNavigateToLogin={jest.fn()} onSignUpSuccess={jest.fn()} />
      );

      await fireEvent.changeText(
        screen.getByLabelText('Full legal name'),
        'Maria Santos'
      );
      await fireEvent.changeText(screen.getByLabelText('Email'), 'new@davaobank.ph');
      await fireEvent.changeText(
        screen.getByLabelText('Password (min 6 characters)'),
        'Secret1234'
      );
      await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'Secret1234');
      await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

      expect(
        await screen.findByText(
          'You appear to be offline. Check your connection and try again.'
        )
      ).toBeTruthy();
      expect(screen.queryByText(/money/i)).toBeNull();
    });
  });

  describe('ForgotPasswordScreen', () => {
    it('shows safe fallback error without money copy on unexpected failure', async () => {
      mockResetPasswordForEmail.mockResolvedValueOnce({
        error: { message: 'Service unavailable' },
      });

      await render(<ForgotPasswordScreen onNavigateToLogin={jest.fn()} />);

      await fireEvent.changeText(
        screen.getByPlaceholderText('name@example.com'),
        'user@davaobank.ph'
      );
      await fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));

      expect(await screen.findByText('Something went wrong. Try again.')).toBeTruthy();
      expect(screen.queryByText(/money/i)).toBeNull();
    });

    it('shows offline copy without money text on network failure', async () => {
      mockResetPasswordForEmail.mockResolvedValueOnce({
        error: { message: 'Network request failed' },
      });

      await render(<ForgotPasswordScreen onNavigateToLogin={jest.fn()} />);

      await fireEvent.changeText(
        screen.getByPlaceholderText('name@example.com'),
        'user@davaobank.ph'
      );
      await fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));

      expect(
        await screen.findByText(
          'You appear to be offline. Check your connection and try again.'
        )
      ).toBeTruthy();
      expect(screen.queryByText(/money/i)).toBeNull();
    });
  });

  describe('ChangePasswordScreen', () => {
    it('shows rate limit error without money copy', async () => {
      mockUpdateUser.mockResolvedValueOnce({
        data: null,
        error: { code: 'over_request_rate_limit', message: 'rate limit' },
      });

      await render(<ChangePasswordScreen />);

      await fireEvent.changeText(screen.getByLabelText('New password'), 'NewPassword123');
      await fireEvent.changeText(
        screen.getByLabelText('Confirm new password'),
        'NewPassword123'
      );
      await fireEvent.press(screen.getByRole('button', { name: 'Change password' }));

      expect(
        await screen.findByText('Too many attempts. Please try again in a few minutes.')
      ).toBeTruthy();
      expect(screen.queryByText(/money/i)).toBeNull();
    });

    it('shows password change failed error without money copy on unexpected failure', async () => {
      mockUpdateUser.mockResolvedValueOnce({
        data: null,
        error: { code: 'unknown_internal_error', message: 'unexpected' },
      });

      await render(<ChangePasswordScreen />);

      await fireEvent.changeText(screen.getByLabelText('New password'), 'NewPassword123');
      await fireEvent.changeText(
        screen.getByLabelText('Confirm new password'),
        'NewPassword123'
      );
      await fireEvent.press(screen.getByRole('button', { name: 'Change password' }));

      expect(
        await screen.findByText("Couldn't change your password. Try again.")
      ).toBeTruthy();
      expect(screen.queryByText(/money/i)).toBeNull();
    });
  });

  describe('VerifyEmailScreen', () => {
    it('shows safe fallback error without money copy when refresh fails unexpectedly', async () => {
      mockRefreshSession.mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'Database query timeout' },
      });

      await render(
        <VerifyEmailScreen email="user@davaobank.ph" onNavigateToLogin={jest.fn()} />
      );

      await fireEvent.press(
        screen.getByRole('button', { name: "I've verified my email" })
      );

      expect(await screen.findByText('Something went wrong. Try again.')).toBeTruthy();
      expect(screen.queryByText(/money/i)).toBeNull();
    });

    it('shows safe fallback error without money copy when resend fails unexpectedly', async () => {
      mockResend.mockResolvedValueOnce({
        error: { message: 'SMTP relay down' },
      });

      await render(
        <VerifyEmailScreen email="user@davaobank.ph" onNavigateToLogin={jest.fn()} />
      );

      await fireEvent.press(screen.getByRole('button', { name: 'Resend email' }));

      expect(await screen.findByText('Something went wrong. Try again.')).toBeTruthy();
      expect(screen.queryByText(/money/i)).toBeNull();
    });
  });
});
