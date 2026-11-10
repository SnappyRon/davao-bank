import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, dispatch: jest.fn() }),
  useIsFocused: () => true,
  usePreventRemove: jest.fn(),
}));
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const calls: string[] = [];
const mockListFactors = jest.fn();
const mockUpdateUser = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      mfa: {
        listFactors: () => {
          calls.push('listFactors');
          return mockListFactors();
        },
      },
      updateUser: (attrs: unknown) => {
        calls.push('updateUser');
        return mockUpdateUser(attrs);
      },
    },
  },
}));

const mockPromptPassword = jest.fn();
const mockPromptTotp = jest.fn();
jest.mock('../context/PasswordPromptContext', () => ({
  ...jest.requireActual('../context/PasswordPromptContext'),
  usePasswordPrompt: () => (options: unknown) => {
    calls.push('password');
    return mockPromptPassword(options);
  },
  useTotpPrompt: () => () => {
    calls.push('totp');
    return mockPromptTotp();
  },
}));

import {
  ChangePasswordScreen,
  PASSWORD_TOO_SHORT,
  PASSWORD_NEEDS_LETTER_AND_DIGIT,
  PASSWORD_MISMATCH,
  PASSWORD_NOT_CHANGED,
  PASSWORD_SAME,
} from '../screens/ChangePasswordScreen';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

// Obvious fakes only.
const FAKE_NEW = 'Fakepass123';

async function fill(newValue: string, confirmValue: string) {
  await fireEvent.changeText(screen.getByLabelText('New password'), newValue);
  await fireEvent.changeText(screen.getByLabelText('Confirm new password'), confirmValue);
}

async function submit() {
  await fireEvent.press(screen.getByRole('button', { name: 'Change password' }));
}

describe('ChangePasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    calls.length = 0;
    mockPromptPassword.mockResolvedValue({ success: true });
    mockPromptTotp.mockResolvedValue({ success: true });
    mockListFactors.mockResolvedValue({
      data: { totp: [{ id: 'f-1', status: 'verified' }] },
      error: null,
    });
    mockUpdateUser.mockResolvedValue({ data: {}, error: null });
  });

  it('uses secure new-password fields', async () => {
    await render(<ChangePasswordScreen />);
    for (const label of ['New password', 'Confirm new password']) {
      const input = screen.getByLabelText(label);
      expect(input.props.secureTextEntry).toBe(true);
      expect(input.props.textContentType).toBe('newPassword');
      expect(input.props.autoComplete).toBe('new-password');
    }
  });

  it.each([
    ['too short', 'Fake12', 'Fake12', PASSWORD_TOO_SHORT],
    ['no digit', 'Fakepassword', 'Fakepassword', PASSWORD_NEEDS_LETTER_AND_DIGIT],
    ['mismatch', FAKE_NEW, 'Fakepass124', PASSWORD_MISMATCH],
  ])('blocks submit when %s', async (_case, newValue, confirmValue, message) => {
    await render(<ChangePasswordScreen />);
    await fill(newValue, confirmValue);
    await submit();
    expect(await screen.findByText(message)).toBeTruthy();
    expect(mockPromptPassword).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('does not change the password when the password prompt is cancelled', async () => {
    mockPromptPassword.mockResolvedValue({ success: false, cancelled: true });
    await render(<ChangePasswordScreen />);
    await fill(FAKE_NEW, FAKE_NEW);
    await submit();
    expect(await screen.findByText(PASSWORD_NOT_CHANGED)).toBeTruthy();
    expect(mockPromptTotp).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('does not change the password when the code prompt is cancelled', async () => {
    mockPromptTotp.mockResolvedValue({ success: false, cancelled: true });
    await render(<ChangePasswordScreen />);
    await fill(FAKE_NEW, FAKE_NEW);
    await submit();
    expect(await screen.findByText(PASSWORD_NOT_CHANGED)).toBeTruthy();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('asks for the password, then the code, then updates once and shows success', async () => {
    await render(<ChangePasswordScreen />);
    await fill(FAKE_NEW, FAKE_NEW);
    await submit();
    expect(await screen.findByText('Password changed')).toBeTruthy();
    expect(calls).toEqual(['password', 'listFactors', 'totp', 'updateUser']);
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: FAKE_NEW });
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('skips the code prompt when no verified authenticator exists', async () => {
    mockListFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    await render(<ChangePasswordScreen />);
    await fill(FAKE_NEW, FAKE_NEW);
    await submit();
    expect(await screen.findByText('Password changed')).toBeTruthy();
    expect(calls).toEqual(['password', 'listFactors', 'updateUser']);
  });

  it('maps updateUser errors to friendly copy and stays on the form', async () => {
    mockUpdateUser.mockResolvedValueOnce({
      data: null,
      error: { code: 'same_password', message: 'raw server text' },
    });
    await render(<ChangePasswordScreen />);
    await fill(FAKE_NEW, FAKE_NEW);
    await submit();
    expect(await screen.findByText(PASSWORD_SAME)).toBeTruthy();
    expect(screen.queryByText('raw server text')).toBeNull();

    mockUpdateUser.mockResolvedValueOnce({
      data: null,
      error: { message: 'Network request failed' },
    });
    await submit();
    await waitFor(() =>
      expect(screen.getByText('You appear to be offline. Nothing was sent.')).toBeTruthy()
    );
    expect(screen.queryByText('Password changed')).toBeNull();
  });
});
