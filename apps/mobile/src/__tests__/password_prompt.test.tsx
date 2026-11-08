import React from 'react';
import { AppState, Button, Text } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { SettingsProvider, useSettings } from '../context/SettingsContext';
import { BottomSheet } from '../components/BottomSheet';
import { PROMPT_UNAVAILABLE } from '../context/PasswordPromptContext';
import { supabase } from '../lib/supabase';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(),
}));
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: { email: 'fixture@example.invalid' } },
      })),
      signInWithPassword: jest.fn(async () => ({ error: null })),
    },
  },
}));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => false),
  supportedAuthenticationTypesAsync: jest.fn(async () => [2]),
  authenticateAsync: jest.fn(),
  AuthenticationType: { FACIAL_RECOGNITION: 2, FINGERPRINT: 1 },
}));

function Trigger({ result }: { result: jest.Mock }) {
  const settings = useSettings();
  return (
    <>
      <Text>
        {settings.isBiometricSupported ? settings.biometricType : 'No enrollment'}
      </Text>
      <Button
        title="Request confirmation"
        onPress={() => {
          void settings
            .confirmMoneyAction({
              title: 'Test authorization',
              requireTotp: false,
              message: 'Confirm fixture action',
            })
            .then(result);
        }}
      />
    </>
  );
}

describe('Password confirmation hosts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(false);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders exactly once inside the newest sheet and Cancel resolves without authorizing', async () => {
    const result = jest.fn();
    await render(
      <SettingsProvider>
        <BottomSheet visible onClose={jest.fn()} title="Lower">
          <Text>Lower sheet</Text>
        </BottomSheet>
        <BottomSheet visible onClose={jest.fn()} title="Top">
          <Trigger result={result} />
        </BottomSheet>
      </SettingsProvider>
    );
    const modals = screen.getAllByTestId('bottom-sheet-modal');
    await fireEvent(modals[0], 'show');
    await fireEvent(modals[1], 'show');
    await fireEvent.press(screen.getByText('Request confirmation'));
    expect(screen.getAllByTestId('password-prompt')).toHaveLength(1);
    expect(within(modals[1]).getByTestId('password-prompt')).toBeTruthy();
    expect(within(modals[0]).queryByTestId('password-prompt')).toBeNull();
    expect(screen.getAllByTestId('bottom-sheet-modal')).toHaveLength(2);
    await fireEvent(screen.getByTestId('password-prompt'), 'layout', {
      nativeEvent: { layout: { width: 390, height: 844 } },
    });
    await fireEvent.press(screen.getByText('Cancel'));
    expect(result).toHaveBeenCalledWith({
      success: false,
      cancelled: true,
      error: 'Authentication required',
    });
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(screen.queryByTestId('password-prompt')).toBeNull();
  });

  it('fails closed after two seconds when the native sheet never presents the prompt', async () => {
    jest.useFakeTimers();
    const result = jest.fn();
    await render(
      <SettingsProvider>
        <BottomSheet visible onClose={jest.fn()}>
          <Trigger result={result} />
        </BottomSheet>
      </SettingsProvider>
    );
    await fireEvent.press(screen.getByText('Request confirmation'));
    expect(screen.queryByTestId('password-prompt')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(1999);
    });
    expect(result).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result).toHaveBeenCalledWith({
      success: false,
      cancelled: undefined,
      error: PROMPT_UNAVAILABLE,
    });
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId('bottom-sheet-modal'), 'show');
    expect(screen.queryByTestId('password-prompt')).toBeNull();
  });

  it('keeps a visible root prompt open on a wrong password, then resolves only after verification', async () => {
    jest.useFakeTimers();
    const result = jest.fn();
    jest
      .mocked(supabase.auth.signInWithPassword)
      .mockResolvedValueOnce({ error: { message: 'Invalid credentials' } } as never);
    await render(
      <SettingsProvider>
        <Trigger result={result} />
      </SettingsProvider>
    );
    await fireEvent.press(screen.getByText('Request confirmation'));
    await fireEvent(screen.getByTestId('password-prompt'), 'layout', {
      nativeEvent: { layout: { width: 390, height: 844 } },
    });
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(result).not.toHaveBeenCalled();
    await fireEvent.changeText(
      screen.getByPlaceholderText('Enter password'),
      'fixture-input'
    );
    await fireEvent.press(screen.getByText('Authorize'));
    expect(screen.getByText('Incorrect password. Please try again.')).toBeTruthy();
    expect(result).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Authorize'));
    expect(result).toHaveBeenCalledWith({ success: true });
    expect(screen.queryByTestId('password-prompt')).toBeNull();
  });

  it('cancels a request when its owning sheet closes instead of leaking it to the root', async () => {
    const result = jest.fn();
    const tree = (visible: boolean) => (
      <SettingsProvider>
        <BottomSheet visible={visible} onClose={jest.fn()}>
          <Trigger result={result} />
        </BottomSheet>
      </SettingsProvider>
    );
    const view = await render(tree(true));
    await fireEvent(screen.getByTestId('bottom-sheet-modal'), 'show');
    await fireEvent.press(screen.getByText('Request confirmation'));
    await fireEvent(screen.getByTestId('password-prompt'), 'layout', {
      nativeEvent: { layout: { width: 390, height: 844 } },
    });
    await view.rerender(tree(false));
    expect(result).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, cancelled: true })
    );
    expect(screen.queryByTestId('password-prompt')).toBeNull();
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('rechecks enrollment when the app becomes active', async () => {
    const listener = jest.spyOn(AppState, 'addEventListener');
    await render(
      <SettingsProvider>
        <Trigger result={jest.fn()} />
      </SettingsProvider>
    );
    expect(screen.getByText('No enrollment')).toBeTruthy();
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true);
    await act(async () => {
      for (const [event, callback] of listener.mock.calls)
        if (event === 'change') callback('active');
    });
    expect(screen.getByText('Face ID')).toBeTruthy();
    listener.mockRestore();
  });
});
